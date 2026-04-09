# Resume Analyzer — Architecture Reference

> **Read this before touching any file.** This document is the single source of truth for design decisions, data flow, service topology, and non-obvious constraints. Every key decision in this codebase has a reason documented here.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Service Map](#2-service-map)
3. [Request Lifecycle](#3-request-lifecycle)
4. [Backend Modules](#4-backend-modules)
5. [LangGraph Pipeline](#5-langgraph-pipeline)
6. [Embedding System](#6-embedding-system)
7. [Database](#7-database)
8. [Frontend](#8-frontend)
9. [Configuration & Environment Variables](#9-configuration--environment-variables)
10. [Docker & Infrastructure](#10-docker--infrastructure)
11. [Critical Constraints](#11-critical-constraints)
12. [Known Issues / Limitations](#12-known-issues--limitations)

---

## 1. System Overview

Resume Analyzer takes a PDF resume and a plain-text job description, runs a 6-node LangGraph RAG pipeline, and returns a structured analysis: overall match score, matched/missing skills, experience gap, and actionable suggestions.

```
Browser → Nginx → FastAPI → Celery Worker → LangGraph Pipeline
                                ↓                    ↓
                          PostgreSQL           ChromaDB + Ollama
```

**Tech stack:**
| Layer | Choice | Why |
|---|---|---|
| API | FastAPI (async) | Async I/O for file uploads + DB queries |
| Task queue | Celery + Redis | Offloads ~60s pipeline from HTTP request |
| Pipeline | LangGraph | Stateful DAG with per-node progress streaming |
| PDF parser | OpenDataLoader | XY-Cut++ reading order — better than PyMuPDF for two-column resumes |
| Embeddings | MS Harrier 0.6B | 1024-dim, in-process via sentence-transformers |
| Vector DB | ChromaDB | Local, no cloud dependency |
| LLM | Llama 3.2 via Ollama | Fully local inference |
| DB | PostgreSQL (asyncpg) | Persists job results; Celery reads via psycopg2 |
| Frontend | Next.js 15 (standalone) | `output: "standalone"` required for Docker |
| Proxy | Nginx | Routes `/api/` → backend, `/` → frontend |

---

## 2. Service Map

All services defined in `docker-compose.yml`:

| Service | Image / Build | Port (host:container) | Purpose |
|---|---|---|---|
| `chromadb` | `chromadb/chroma:latest` | 8001:8000 | Vector storage |
| `redis` | `redis:7-alpine` | 6379:6379 | Celery broker (db/0) + result backend (db/1) |
| `postgres` | `postgres:16-alpine` | 5432:5432 | Job results persistence |
| `ollama` | `ollama/ollama:latest` | 11434:11434 | LLM inference (llama3.2) |
| `backend` | `./backend` | 8000:8000 | FastAPI API server |
| `celery_worker` | `./backend` | — | Celery worker (same image as backend) |
| `frontend` | `./frontend` | 3000:3000 | Next.js app |
| `nginx` | `nginx:alpine` | 80:80 | Reverse proxy |

**Startup order** (enforced by `depends_on` + healthchecks):  
`chromadb, redis, postgres, ollama` must be healthy before `backend` and `celery_worker` start.  
`backend, frontend` must be up before `nginx`.

**Ollama cold-start:** The ollama service uses a retry entrypoint loop (15 × 5s) to handle slow cold starts and only pulls `llama3.2` if it isn't already cached in `./volumes/ollama`.

---

## 3. Request Lifecycle

```
1. POST /api/v1/analyze (multipart: resume PDF + jd_text)
   → FastAPI validates file (PDF only, ≤10MB) and JD (≤20000 chars)
   → Writes PDF to /app/uploads/{job_id}.pdf
   → Creates Job row in PostgreSQL (status="pending")
   → Dispatches process_resume_task to Celery with task_id=job_id
   → Returns { job_id }

2. GET /api/v1/status/{job_id}  (polled every 2s by frontend)
   → Reads Celery AsyncResult for task progress
   → Maps Celery states → API states:
       PENDING/STARTED/RUNNING/RETRY → "running"
       SUCCESS → "completed"
       FAILURE → "failed"
   → Returns { status, progress (0-100), message }

3. GET /api/v1/results/{job_id}  (called once status="completed")
   → Reads Job row from PostgreSQL
   → Returns full analysis result

4. Celery worker (process_resume_task):
   → Runs LangGraph pipeline (parse→chunk→embed→retrieve→score→gap_analyze)
   → Calls self.update_state() after each node (progress %)
   → Writes final results to PostgreSQL (status="completed")
   → Deletes the uploaded PDF from disk in `finally` block
```

---

## 4. Backend Modules

```
backend/app/
├── main.py           # FastAPI app, lifespan, 4 endpoints
├── core/
│   ├── config.py     # Pydantic Settings — all env vars
│   ├── graph.py      # LangGraph pipeline — 6 nodes + assembly
│   ├── embedding.py  # encode_documents() / encode_queries()
│   ├── schema.py     # GraphState TypedDict, ResumeScoreOutput, GapAnalysisOutput
│   └── celery_app.py # Celery app instance (broker + backend config)
├── db/
│   ├── models.py     # SQLAlchemy Job model
│   └── database.py   # Async engine (FastAPI) + sync engine (Celery)
└── worker/
    └── tasks.py      # process_resume_task — Celery task
```

### `main.py`
- `lifespan`: calls `create_tables()` on startup (SQLAlchemy `metadata.create_all` — no Alembic).
- CORS allows `localhost`, `localhost:3000`, `localhost:80`.
- File size check is done **in memory before disk write** (`await resume.read()` then `len(contents)`).
- Celery task is dispatched with `task_id=job_id` so `AsyncResult(job_id)` works directly.

### `core/config.py`
All settings read from environment / `.env` file via Pydantic Settings:

| Setting | Default | Used by |
|---|---|---|
| `OLLAMA_BASE_URL` | `http://localhost:11434` | graph.py score/gap nodes |
| `OLLAMA_MODEL` | `llama3.2` | graph.py score/gap nodes |
| `EMBEDDING_PROVIDER` | `harrier` | embedding.py dispatch |
| `HARRIER_MODEL` | `microsoft/harrier-oss-v1-0.6b` | embedding.py |
| `CHROMA_HOST` | `localhost` | graph.py embed/retrieve |
| `CHROMA_PORT` | `8001` | graph.py embed/retrieve |
| `CELERY_BROKER_URL` | `redis://localhost:6379/0` | celery_app.py |
| `CELERY_RESULT_BACKEND` | `redis://localhost:6379/1` | celery_app.py |
| `DATABASE_URL` | `postgresql+asyncpg://...` | database.py |
| `UPLOAD_DIR` | `./uploads` | main.py |
| `MAX_FILE_SIZE_MB` | `10` | main.py |
| `MAX_JD_CHARS` | `20000` | main.py |

### `db/database.py`
Two engines from the same `DATABASE_URL`:
- **Async engine** (`create_async_engine` + `asyncpg`): used by FastAPI endpoints.
- **Sync engine** (`create_engine` + `psycopg2`): used by Celery worker. Derived by replacing `+asyncpg` with `+psycopg2` in `_make_sync_url()`.

> **IMPORTANT:** `DATABASE_URL` must always use the `postgresql+asyncpg://` scheme. The sync engine conversion happens internally — never set `DATABASE_URL=postgresql+psycopg2://` in docker-compose for the celery_worker service.

---

## 5. LangGraph Pipeline

Defined in `core/graph.py`. Linear DAG — no branching:

```
parse → chunk → embed → retrieve → score → gap_analyze → END
```

Progress milestones reported after each node (`worker/tasks.py`):

| Node | Progress % | What it does |
|---|---|---|
| `parse` | 25% | PDF → markdown text via OpenDataLoader (XY-Cut++ layout) |
| `chunk` | 40% | Token-based splitting (tiktoken gpt2 encoder) |
| `embed` | 62% | Harrier embeddings → ChromaDB (2 collections per session) |
| `retrieve` | 74% | Query resume collection with requirement-dense JD chunks |
| `score` | 88% | Ollama LLM → `ResumeScoreOutput` (score, skills, gap, confidence) |
| `gap_analyze` | 96% | Ollama LLM → `GapAnalysisOutput` (suggestions, summary) |

### Chunking
- Resume: `chunk_size=400 tokens`, `chunk_overlap=50`, separators start with `## ` and `# ` to keep sections together.
- JD: `chunk_size=300 tokens`, `chunk_overlap=40`, separators oriented for bullet-point JDs.
- Uses `RecursiveCharacterTextSplitter.from_tiktoken_encoder(model_name="gpt2")` — this is token-based, not character-based.

### ChromaDB Collections
Two collections per job: `session_{job_id}_resume` and `session_{job_id}_jd`.
- Collections are **not deleted after the job** — they accumulate in ChromaDB. This is intentional for now (potential future caching).
- `hnsw:space: cosine` — cosine distance metric.
- Embeddings are passed **pre-computed** via `embeddings=` / `query_embeddings=` params, bypassing ChromaDB's EmbeddingFunction.

### JD Query Selection (`_select_jd_queries`)
Does **not** use the first N JD chunks (those contain job title/intro, not requirements).  
Ranks all JD chunks by count of requirement-signal words (`_REQUIREMENT_SIGNALS` frozenset), takes top 8.

### LLM Calls
Both `score_node` and `gap_analyze_node` use `ChatOllama(..., format="json")` with `.with_structured_output(PydanticModel)`.  
`format="json"` is set at the Ollama level to prevent markdown fence wrapping of JSON output.

---

## 6. Embedding System

`core/embedding.py` — two public functions:

```python
encode_documents(texts)  # No instruction — for resume/JD chunks stored in ChromaDB
encode_queries(texts)    # With prompt_name="sts_query" — for retrieval queries
```

**Why two functions?** Harrier requires asymmetric encoding:
- Documents: encoded **without** any instruction prompt.
- Queries: encoded **with** `prompt_name="sts_query"` (Harrier's STS retrieval instruction).
Using the same encoding for both significantly degrades retrieval quality.

The model is loaded once per process via `@lru_cache(maxsize=1)` on `_harrier_model()`.  
`model_kwargs={"dtype": "auto"}` → fp16 on GPU, fp32 on CPU.

**Fallback provider:** Set `EMBEDDING_PROVIDER=ollama` to use `nomic-embed-text` via Ollama HTTP API instead of Harrier. Note: the `sts_query` instruction has no effect in the ollama path — both encode_documents and encode_queries call the same `_ollama_encode`.

---

## 7. Database

Single table: `jobs`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | Same as Celery task_id |
| `status` | String(20) | `pending` → `running` → `completed` \| `failed` |
| `created_at` | DateTime(tz) | Set on insert |
| `updated_at` | DateTime(tz) | Updated by `_update_job()` in tasks.py |
| `overall_score` | Float | 0–100 |
| `matched_skills` | JSON | `List[str]` |
| `missing_skills` | JSON | `List[str]` |
| `experience_gap` | Text | Nullable |
| `suggestions` | JSON | `List[str]` |
| `summary` | Text | Nullable |
| `confidence` | Float | 0–1 |
| `error_message` | Text | Populated on failure |

**No Alembic.** Tables are created via `Base.metadata.create_all` in the FastAPI lifespan. To add columns: add them to `models.py` and run `make down && make up` (or drop the table manually).

---

## 8. Frontend

```
frontend/src/
├── app/
│   ├── layout.tsx              # Root layout — Space Grotesk + JetBrains Mono fonts
│   ├── globals.css             # Design system: CSS variables, grid-bg, animate-rise
│   ├── page.tsx                # Upload page (split layout: context sidebar + form)
│   └── analyze/[id]/page.tsx  # Results page (polls status, then shows results)
└── components/
    ├── ResumeDropzone.tsx      # Drag-and-drop PDF input
    └── JobDescTextArea.tsx     # JD text input with char counter
```

### Design System
All colors and typography are defined as CSS variables in `globals.css`:

| Variable | Value | Role |
|---|---|---|
| `--bg` | `#0c0c0a` | Page background |
| `--surface` | `#131310` | Card/input background |
| `--border` | `#272720` | Default borders |
| `--accent` | `#e8c547` | Amber — primary action color |
| `--text-primary` | `#f0ede6` | Headings, key content |
| `--text-secondary` | `#8a8780` | Body text, labels |
| `--text-dim` | `#3d3c38` | Mono labels, placeholders |
| `--green` | `#5db876` | Matched skills |
| `--red` | `#e05252` | Missing skills / errors |
| `--orange` | `#e8854a` | Experience gap |

Utility classes defined in `globals.css` (not Tailwind):
- `.grid-bg` — faint 48px grid texture
- `.animate-rise` — fade + translateY entrance (0.45s)
- `.animate-rise-{1-4}` — staggered delays (60ms apart)
- `.custom-scrollbar` — thin scrollbar for textarea

### Status Polling (`analyze/[id]/page.tsx`)
- Polls `GET /api/v1/status/{id}` every 2 seconds.
- Status values from API: `pending`, `running`, `completed`, `failed`.
- On `completed`: fetches `GET /api/v1/results/{id}`. If response is not 200 (DB lag), retries after 2s.
- Progress is a top-of-page 2px amber bar + a 0–100% large monospaced number.
- Node completion is shown via a dot list (dots turn amber as each node passes its threshold %).

### API URL
```ts
process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api"
```
`NEXT_PUBLIC_API_URL` is baked at **build time** — it must be passed as a Docker build arg:
```yaml
# docker-compose.yml
build:
  context: ./frontend
  args:
    NEXT_PUBLIC_API_URL: http://localhost/api
```
Setting it in `environment:` at runtime has no effect on Next.js static builds.

---

## 9. Configuration & Environment Variables

Copy `.env.example` → `.env` for local dev. Docker Compose overrides service hostnames automatically via `environment:` blocks — the `.env` file localhost values are used for `make dev-*` commands only.

All variables consumed by the Python app are in `Settings` (`core/config.py`).  
Variables in `.env` that are **not** in `Settings` (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`) are used directly by the `postgres` Docker Compose service, not by Python code.

---

## 10. Docker & Infrastructure

### backend/Dockerfile
Multi-stage is **not** used — single stage with a key optimization:
```dockerfile
# CPU-only torch installed FIRST from PyTorch's CPU wheel index (~200MB vs ~2GB CUDA)
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir -r requirements.txt
```
Do not reorder these lines — installing requirements.txt first will pull the full CUDA torch.

### frontend/Dockerfile
3-stage build: `deps` → `builder` → `runner`.
- `output: "standalone"` is set in `next.config.ts` — required for the runner stage to work.
- Build script is `next build` (not `next build --turbopack` — `--turbopack` is dev-only).
- `npm install` not `npm ci` — no `package-lock.json` is committed.

### ChromaDB Healthcheck
The chromadb image has no `curl`, `wget`, `python`, or `nc`. Uses bash built-in TCP check:
```yaml
test: ["CMD-SHELL", "bash -c '</dev/tcp/localhost/8000' || exit 1"]
```

### Volumes
```
volumes/
├── chromadb/   # ChromaDB persistent storage
├── redis/      # Redis RDB snapshot
├── postgres/   # PostgreSQL data
├── ollama/     # Ollama model cache (prevents re-download on restart)
├── uploads/    # Shared between backend and celery_worker
└── hf_cache/   # HuggingFace model cache for Harrier
```
`uploads/` and `hf_cache/` are mounted into both `backend` and `celery_worker` services.

### Nginx
Routes:
- `/api/*` → `backend:8000` (120s read timeout for long analyses)
- `/*` → `frontend:3000` (WebSocket upgrade headers for Next.js HMR)
- `client_max_body_size 15M` (backend enforces 10MB; nginx allows 15MB headroom)

---

## 11. Critical Constraints

> Violating these will break the application.

1. **`DATABASE_URL` must always use `postgresql+asyncpg://`** — even for the celery_worker service. The sync psycopg2 URL is derived internally by `_make_sync_url()`. Never override this with `psycopg2://` in docker-compose.

2. **Harrier asymmetric encoding** — `encode_documents` uses no prompt; `encode_queries` uses `prompt_name="sts_query"`. Swapping these, or using a single function for both, will degrade retrieval quality significantly.

3. **Pre-computed embeddings** — ChromaDB collections are created **without** an EmbeddingFunction. Embeddings are passed via `embeddings=` and `query_embeddings=`. Do not add an EmbeddingFunction to these collections — it will conflict with pre-computed vectors.

4. **`NEXT_PUBLIC_API_URL` is build-time** — must be in `build.args:` in docker-compose, not `environment:`. Runtime env vars have no effect on Next.js static output.

5. **`output: "standalone"` in next.config.ts** — required for the 3-stage Docker build. Removing it will break the runner stage (no `server.js` will be generated).

6. **`format="json"` on ChatOllama** — both LLM calls set this at the Ollama level. Without it, Ollama may wrap JSON output in markdown code fences, breaking `with_structured_output()` parsing.

7. **`n_results = min(3, max(1, n_resume_chunks))`** — ChromaDB raises if `n_results` exceeds the number of documents in the collection. Short resumes may have fewer than 3 chunks.

8. **No Alembic** — schema changes require manual table drop or a custom migration script. `create_all` is idempotent for new tables but does not alter existing columns.

---

## 12. Known Issues / Limitations

- **Slow first run** — Harrier model (~1.2GB) downloads on first worker startup. Subsequent runs use `./volumes/hf_cache`.
- **ChromaDB collection accumulation** — session collections are never deleted. Long-running instances will accumulate many collections.
- **Single Celery worker concurrency=2** — `process_resume_task` loads Harrier in-process. With `concurrency=2`, two workers share memory. With higher concurrency, memory usage grows linearly with model size.
- **Ollama serial inference** — both score and gap_analyze nodes call Ollama sequentially. These two LLM calls are the primary latency contributors (~20-40s each depending on hardware).
- **No authentication** — the API has no auth. Do not expose port 8000 or 80 directly to the internet without adding authentication.
- **PDF cleanup on failure** — the `finally` block in `tasks.py` deletes the PDF even on task failure. This is intentional to prevent disk accumulation.
