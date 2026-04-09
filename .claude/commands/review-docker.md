# Review Docker Setup

You are reviewing the Docker Compose and Dockerfile configuration for the Resume Analyzer project.

## Project Context
- 8 services: chromadb, redis, postgres, ollama, backend, celery_worker, frontend, nginx
- Backend uses Python 3.12-slim; Frontend uses Node 20-alpine multi-stage
- Key files: `docker-compose.yml`, `backend/Dockerfile`, `frontend/Dockerfile`, `nginx/nginx.conf`

## What to Review

Read all Docker files first, then check each area:

**1. `docker-compose.yml` — Services**

Infrastructure services (chromadb, redis, postgres, ollama):
- Do chromadb, redis, postgres all have `healthcheck` blocks?
- Does chromadb healthcheck hit `/api/v1/heartbeat`?
- Does postgres healthcheck use `pg_isready -U resumeanalyzer`?
- Does redis healthcheck use `redis-cli ping`?
- Does ollama entrypoint pull `llama3.2` on first start?

Application services (backend, celery_worker, frontend, nginx):
- Do backend and celery_worker both set `CHROMA_PORT=8000` (internal) not 8001 (host)?
- Does celery_worker use `postgresql+psycopg2://` in DATABASE_URL?
- Does backend use `postgresql+asyncpg://` in DATABASE_URL?
- Do both backend and celery_worker mount `./volumes/hf_cache:/root/.cache/huggingface`?
- Do both backend and celery_worker mount `./volumes/uploads:/app/uploads`?
- Does backend `depends_on` all infra with `condition: service_healthy`?
- Does nginx mount `nginx.conf` as read-only (`:ro`)?

**2. `backend/Dockerfile`**
- Base image: `python:3.12-slim`?
- Are system deps installed: `build-essential`, `libpq-dev`?
- Is `requirements.txt` copied and installed before app code (layer caching)?
- Is `/app/uploads` created with `RUN mkdir -p`?
- Does CMD run uvicorn on `0.0.0.0:8000`?

**3. `frontend/Dockerfile`**
- Is it a 3-stage build: `deps` → `builder` → `runner`?
- Does `deps` stage use `npm install` (not `npm ci` which requires lockfile)?
- Does `builder` stage run `npm run build`?
- Does `runner` stage set `NODE_ENV=production`?
- Does it copy `.next/standalone`, `.next/static`, and `public`?

**4. `next.config.ts`**
- Is `output: "standalone"` set? (Required for the standalone Dockerfile to work)
- Is `next build` used (not `next build --turbopack` which is dev-only)?

**5. `nginx/nginx.conf`**
- Does `/api/` proxy to `http://backend` (internal service)?
- Does `/` proxy to `http://frontend` (internal service)?
- Is `client_max_body_size` set to at least 15M?
- Is `proxy_read_timeout` set for long analysis requests (≥120s)?
- Are WebSocket upgrade headers set for the frontend (`Upgrade`, `Connection`)?

**6. Volumes**
- Are these volumes declared: chromadb, redis, postgres, ollama, uploads, hf_cache?
- Are all `./volumes/*` paths bind-mounted (not anonymous volumes)?

**7. Port Conflicts**
- Does chromadb map `8001:8000` (host:container)?
- No two services map to the same host port?

## Output Format

Report findings as **PASS / WARN / FAIL** per section. End with a fix list for any FAILs.
