# Review FastAPI Backend

You are reviewing the FastAPI backend for the Resume Analyzer project.

## Project Context
- Stack: FastAPI + Celery + Redis + PostgreSQL (asyncpg for API, psycopg2 for Celery)
- Key files: `backend/app/main.py`, `backend/app/worker/tasks.py`, `backend/app/core/config.py`, `backend/app/db/`

## What to Review

Read all backend files first, then check each area:

**1. Endpoints (`main.py`)**

`POST /api/v1/analyze`:
- Is file extension checked (`.pdf` only)?
- Is file SIZE checked before writing to disk (against `MAX_FILE_SIZE_MB`)?
- Is JD length checked (against `MAX_JD_CHARS`)?
- Is file content read with `await resume.read()` (not streaming to disk directly)?
- Is Job record created in DB before dispatching Celery?
- Is `job_id` the Celery `task_id`?

`GET /api/v1/status/{job_id}`:
- Are Celery states mapped to API contract states: `pending|running|completed|failed`?
- Is progress extracted from `res.info.get("progress")` safely?

`GET /api/v1/results/{job_id}`:
- Does it read from PostgreSQL (not Celery result backend)?
- Is 404 returned for unknown job_id?
- Is 202 returned for not-yet-complete jobs?
- Is 422 returned for failed jobs?

`GET /api/v1/health`:
- Does it return `{"status": "ok"}`?

**2. CORS**
- Are `http://localhost`, `http://localhost:3000` both in `allow_origins`?

**3. Lifespan**
- Is `create_tables()` called on startup?
- Is `UPLOAD_DIR` created on startup?

**4. Config (`config.py`)**
- Is `model_config = {"env_file": ".env", "extra": "ignore"}` used (not inner `Config` class)?
- Are all required settings present: OLLAMA_BASE_URL, CHROMA_HOST/PORT, CELERY_*, DATABASE_URL, UPLOAD_DIR, MAX_FILE_SIZE_MB, MAX_JD_CHARS?

**5. Database (`db/`)**
- Does `Job` model have: id (UUID), status, created_at, updated_at, all result fields (score, skills, etc.)?
- Does `database.py` have both async engine (FastAPI) and sync engine (Celery)?
- Does sync URL replace `+asyncpg` with `+psycopg2`?

**6. Celery Task (`tasks.py`)**
- Does it update Job status to `"running"` before graph invocation?
- Does it persist all result fields to DB on success?
- Does it persist `status="failed"` + `error_message` on exception?
- Does it re-raise exception (for Celery retry/failure tracking)?

**7. Security**
- Is there any path traversal risk in `UPLOAD_DIR` / `job_id.pdf`?
- Is `job_id` always a UUID (not user-controlled string used in file path)?

## Output Format

Report findings as:
- **PASS** — correct
- **WARN** — works but risky or incomplete
- **FAIL** — bug, security issue, or missing feature

End with a prioritized fix list.
