# Review Database Layer

You are reviewing the PostgreSQL database layer for the Resume Analyzer project.

## Project Context
- PostgreSQL 16 via SQLAlchemy 2.0
- Async engine (asyncpg) for FastAPI; sync engine (psycopg2) for Celery
- Key files: `backend/app/db/models.py`, `backend/app/db/database.py`, `backend/app/main.py` (lifespan), `backend/app/worker/tasks.py`

## What to Review

Read all DB-related files first, then audit:

**1. `models.py`**
- Does `Job` model inherit from `Base` (DeclarativeBase)?
- Is `id` a UUID primary key with `default=uuid.uuid4`?
- Is `status` a String column with default `"pending"`?
- Are `created_at` and `updated_at` DateTime columns with timezone=True?
- Are all result fields present: `overall_score` (Float), `matched_skills` (JSON), `missing_skills` (JSON), `experience_gap` (Text), `suggestions` (JSON), `summary` (Text), `confidence` (Float)?
- Is `error_message` (Text, nullable) present for failure logging?
- Are nullable fields set `nullable=True`?

**2. `database.py`**
- Is the async engine created with `create_async_engine(settings.DATABASE_URL)`?
- Is `AsyncSessionLocal` created with `async_sessionmaker(async_engine, expire_on_commit=False)`?
- Is `create_tables()` an async function using `async with async_engine.begin() as conn`?
- Does `create_tables()` call `conn.run_sync(Base.metadata.create_all)`?
- Is the sync engine URL derived by replacing `+asyncpg` with `+psycopg2`?
- Is `SyncSessionLocal` created with `sessionmaker(sync_engine, expire_on_commit=False)`?

**3. `main.py` — Lifespan**
- Is `create_tables()` awaited in the lifespan startup?
- Are DB sessions used as async context managers (`async with AsyncSessionLocal() as session`)?

**4. `tasks.py` — Sync DB Usage**
- Are sync sessions used as context managers (`with SyncSessionLocal() as session`)?
- Is `session.get(Job, uuid.UUID(job_id))` used to fetch by UUID?
- Is `session.commit()` called after updates?
- Is `_update_job()` helper safe (handles None job gracefully)?

**5. Query Correctness**
- In `main.py /results`: Is `select(Job).where(Job.id == uid)` used?
- Is `scalar_one_or_none()` used (not `fetchone()` or `first()`)?

**6. Missing Features**
- Are there any Alembic migrations? (If no, flag as WARN — table creation via `create_all` is dev-only)
- Is there an index on `Job.status` for querying pending/running jobs?
- Is there a cleanup mechanism to delete old Job records (>7 days)?

## Output Format

Report findings as **PASS / WARN / FAIL**. Missing Alembic = WARN (not FAIL for dev).
Suggest schema improvements or index additions where relevant.
