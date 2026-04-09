# Refine Platform

You are performing a holistic review and refinement of the Resume Analyzer platform.

## Project Context

Full stack AI resume analysis tool:
- **Backend**: FastAPI + LangGraph + Celery + Redis + PostgreSQL
- **AI Pipeline**: OpenDataLoader → Harrier embeddings → ChromaDB → Ollama llama3.2
- **Frontend**: Next.js 15 + React 19 + Tailwind CSS
- **Infrastructure**: Docker Compose (8 services) + Nginx

## Instructions

The user wants a comprehensive sweep of the platform. Run ALL review skills in sequence:

1. First, read these key files to build context:
   - `backend/app/core/graph.py`
   - `backend/app/core/embedding.py`
   - `backend/app/main.py`
   - `backend/app/worker/tasks.py`
   - `backend/app/db/models.py`
   - `docker-compose.yml`
   - `frontend/src/app/page.tsx`
   - `frontend/src/app/analyze/[id]/page.tsx`

2. Then evaluate each layer:

### RAG Pipeline
- Are all 6 nodes correct? (parse, chunk, embed, retrieve, score, gap_analyze)
- Are embeddings using correct doc vs query prompts?
- Is ChromaDB configured with cosine distance?

### API Layer
- Are all 4 endpoints correct and handling errors properly?
- Is file size validation before disk write?
- Are job results read from PostgreSQL (not Redis)?

### Database
- Is the Job model complete with all result fields?
- Are both async and sync engines configured correctly?

### Celery
- Is task progress reported at multiple checkpoints?
- Is the Harrier model cache shared between backend and celery_worker?

### Frontend
- Are API URLs using `NEXT_PUBLIC_API_URL`?
- Are status strings using `"completed"/"failed"` (not Celery raw states)?

### Docker
- Are all 8 services defined with healthchecks?
- Is the HF cache volume mounted to both backend and celery_worker?

### Security
- Is file upload validated (type + size)?
- Are error responses not leaking internal details?

## Output Format

Produce a structured report:

```
## Overall Health: [Green / Yellow / Red]

### Critical Issues (fix before first run)
- ...

### Important Improvements (fix this week)
- ...

### Nice to Have (backlog)
- ...

### What's Working Well
- ...
```

Be specific — include file:line references for each issue.
