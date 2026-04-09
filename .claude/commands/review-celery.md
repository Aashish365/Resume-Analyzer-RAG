# Review Celery & Async Workers

You are reviewing the Celery task queue setup for the Resume Analyzer project.

## Project Context
- Celery with Redis broker (db/0) and result backend (db/1)
- Tasks defined in `backend/app/worker/tasks.py`
- Celery app configured in `backend/app/core/celery_app.py`
- Workers run in the `celery_worker` Docker service

## What to Review

Read all Celery-related files first, then audit:

**1. `celery_app.py`**
- Is `include=["app.worker.tasks"]` set so tasks are auto-discovered?
- Are these serialization settings configured?
  - `task_serializer="json"`
  - `accept_content=["json"]`
  - `result_serializer="json"`
  - `timezone="UTC"`, `enable_utc=True`
- Is the broker `redis://redis:6379/0` (in Docker)?
- Is the result backend `redis://redis:6379/1` (separate db from broker)?

**2. `tasks.py`**
- Is the task decorated with `@celery_app.task(bind=True, name="analyze_resume")`?
- Does `process_resume_task(self, job_id, pdf_path, jd_text)` match the `apply_async(args=[...])` call in `main.py`?
- Is `self.update_state(state="RUNNING", meta={"progress": N})` called at key stages?
- Does the task update Job status to `"running"` in DB before starting?
- Does the task write all result fields to DB on success?
- Does the task write `status="failed"` + `error_message=str(exc)` on exception?
- Does it re-raise the exception after persisting failure?
- Is the sync DB session from `SyncSessionLocal` used (not async)?

**3. Task Progress Granularity**
- Is progress updated at multiple stages (not just 10% at start and 100% at end)?
- Suggested checkpoints: parse=20%, chunk=35%, embed=55%, retrieve=70%, score=85%, gap=95%

**4. `docker-compose.yml` — celery_worker service**
- Command: `celery -A app.core.celery_app worker --loglevel=info --concurrency=2`?
- Does it share the same `volumes/uploads` mount as backend?
- Does it share the same `volumes/hf_cache` mount (for Harrier model)?
- Does it `depend_on` redis, postgres, chromadb (all healthy)?

**5. Celery Beat (Cleanup Task)**
- Is there a periodic task to delete ChromaDB collections older than 24h?
  - Collection naming pattern: `session_{job_id}_resume` and `session_{job_id}_jd`
  - If missing, flag as WARN and suggest adding a `cleanup_old_sessions` beat task

**6. Error Handling**
- If `graph.invoke()` raises, does the exception propagate to Celery (so it marks task as FAILURE)?
- Is the DB failure state written BEFORE re-raising?

## Output Format

Report findings as **PASS / WARN / FAIL**. Flag missing Celery beat cleanup as WARN.
Suggest concrete code snippets for any FAILs.
