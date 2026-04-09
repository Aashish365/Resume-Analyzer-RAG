# Add Tests

You are helping write tests for the Resume Analyzer project.

## Project Context
- Test runner: pytest with pytest-cov
- Backend: FastAPI (use `httpx.AsyncClient` + `ASGITransport`), Celery (test with `task_always_eager=True`)
- Test dirs: `backend/tests/unit/`, `backend/tests/integration/`
- Fixtures dir: `backend/tests/fixtures/` (sample PDFs, sample JDs)

## Test Strategy

### Unit Tests (`backend/tests/unit/`)

**`test_parse_node.py`**
- Mock `OpenDataLoaderPDFLoader.load()` to return sample LangChain Documents
- Assert `resume_text` is joined with `\n\n`
- Assert markdown headers in source appear in output

**`test_chunk_node.py`**
- Pass a known resume_text with `## Experience` and `## Skills` sections
- Assert resume chunks respect the 400-token limit
- Assert JD chunks respect the 300-token limit
- Assert `chunk_index` metadata is sequential

**`test_embed_node.py`**
- Mock `encode_documents()` to return fixed-size vectors (list of 1024 floats)
- Mock ChromaDB `HttpClient` — assert two collections created (`_resume` and `_jd`)
- Assert `embeddings=` param passed to `collection.add()` (not documents-only)
- Assert collection metadata has `{"hnsw:space": "cosine"}`

**`test_retrieve_node.py`**
- Mock `encode_queries()` to return fixed vectors
- Mock ChromaDB `collection.query()` to return known documents
- Assert deduplication works (duplicate docs appear once in `retrieved_context`)
- Assert fallback to `resume_text[:3000]` when `jd_chunks` is empty

**`test_score_node.py`**
- Mock `ChatOllama.with_structured_output().invoke()` to return a `ResumeScoreOutput`
- Assert all fields are passed to graph state
- Assert resume_text is truncated to 4000 chars

**`test_embedding.py`**
- Mock `SentenceTransformer.encode()` to return a numpy array
- Assert `encode_documents()` calls encode with no `prompt_name`
- Assert `encode_queries()` calls encode with `prompt_name="sts_query"`
- Assert `_harrier_model()` is only instantiated once (lru_cache test)

**`test_models.py`**
- Test `Job` model: default status is "pending", id is UUID
- Test `_make_sync_url()` replaces `+asyncpg` with `+psycopg2`

### Integration Tests (`backend/tests/integration/`)

These require all Docker services running. Skip with `@pytest.mark.skipif` if services unavailable.

**`test_api.py`**
- `POST /api/v1/health` → 200, `{"status": "ok"}`
- `POST /api/v1/analyze` with valid PDF + JD → 200, returns `job_id`
- `POST /api/v1/analyze` with non-PDF → 400
- `POST /api/v1/analyze` with oversized file → 400
- `POST /api/v1/analyze` with oversized JD → 400
- `GET /api/v1/status/{valid_id}` → 200 with status field
- `GET /api/v1/status/{invalid_uuid}` → handles gracefully
- `GET /api/v1/results/{unknown_id}` → 404

**`test_pipeline_e2e.py`**
- Submit `tests/fixtures/sample_resume.pdf` + a sample JD
- Poll status until `completed` or timeout (60s)
- Assert results has: `overall_score` (0-100), `matched_skills` (list), `missing_skills` (list), `summary` (non-empty string)

### Test Fixtures

Create `backend/tests/fixtures/`:
- `sample_resume.pdf` — minimal single-page PDF with skills section
- `sample_jd.txt` — 500-char job description
- `conftest.py` — shared fixtures (app client, DB session, mock embedder)

### Running Tests
```bash
# Unit only (no Docker needed)
pytest backend/tests/unit/ -v --cov=app --cov-report=term-missing

# Integration (requires make infra + make dev-backend)
pytest backend/tests/integration/ -v
```

## When Writing Tests
- Mock external services (ChromaDB, Ollama, sentence-transformers) in unit tests
- Use `pytest.fixture` with `scope="session"` for expensive fixtures (model loading)
- Use `pytest-asyncio` for async FastAPI tests
- Name tests `test_{what}_{expected_outcome}` e.g. `test_chunk_resume_respects_max_size`

## Output
Write the test file(s) the user asks for, following the patterns above.
Always include at least one happy-path test and one error/edge-case test per function.
