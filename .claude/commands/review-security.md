# Security Review

You are performing a security audit of the Resume Analyzer project.

## Project Context
- Public-facing API accepting PDF uploads and arbitrary text
- Stack: FastAPI + Celery + PostgreSQL + ChromaDB + Ollama (local LLM)
- Key attack surfaces: file upload, JD text injection, LLM prompt injection

## What to Review

Read all backend and frontend files, then audit each area:

**1. File Upload (`main.py`)**
- Is file extension checked AND MIME type? (extension-only is bypassable)
  - Suggest: also check `resume.content_type == "application/pdf"`
- Is file size checked BEFORE writing to disk?
- Is `job_id` always a freshly generated UUID (not user-controlled)?
- Is the file saved as `{uuid4}.pdf` with no user-provided filename in the path?
- Could a path traversal attack reach files outside `UPLOAD_DIR`?

**2. LLM Prompt Injection**
- Is user-supplied `jd_text` inserted directly into LLM prompts?
  - This is unavoidable but the JD should be length-limited (MAX_JD_CHARS ✓)
  - The resume PDF has built-in injection filtering via OpenDataLoader ✓
  - Flag if JD text is not sanitized at all

**3. Input Validation**
- Is `jd_text` length checked server-side (not just client-side)?
- Is file size checked server-side?
- Is UUID format validated before DB queries (to prevent format errors)?

**4. CORS**
- Are origins restricted to known domains (not `allow_origins=["*"]`)?
- In production, should be locked to the nginx domain, not `localhost`

**5. Database**
- Is user input ever used in raw SQL? (Should use SQLAlchemy ORM only)
- Is `job_id` validated as UUID before being used in queries?

**6. Uploaded File Handling**
- Are uploaded PDFs deleted after processing?
  - If not, flag as WARN — disk fills up and files persist longer than needed
  - Suggest: delete `pdf_path` in `tasks.py` after graph completes

**7. ChromaDB**
- Is ChromaDB exposed on a host port (8001)?
  - In production, should not be publicly accessible
  - Suggest: remove host port mapping for chromadb in production

**8. Environment Variables**
- Are secrets (POSTGRES_PASSWORD, etc.) in `.env` (gitignored) not hardcoded?
- Is `.env` in `.gitignore`?

**9. Error Responses**
- Do error responses leak internal paths, stack traces, or system details?
- Are 500 errors caught and returned as generic messages?

**10. Rate Limiting**
- Is there any rate limiting on `POST /api/v1/analyze`?
  - Without it, a user can spam the endpoint and exhaust system resources
  - Suggest: add `slowapi` rate limiter (e.g., 5 req/min per IP)

## Output Format

Report findings as:
- **PASS** — secure
- **WARN** — acceptable risk for dev, fix before production
- **FAIL** — active vulnerability, fix immediately

Prioritize FAILs first, then WARNs.
