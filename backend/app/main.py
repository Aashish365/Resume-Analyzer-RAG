import os
import uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger
from app.core.config import settings
from app.worker.tasks import process_resume_task
from app.db.database import create_tables, AsyncSessionLocal
from app.db.models import Job
from celery.result import AsyncResult
from sqlalchemy import select


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Resume Analyzer API — creating DB tables if needed")
    await create_tables()
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    yield
    logger.info("Shutting down")


app = FastAPI(title="Resume Analyzer API", version="3.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost",
        "http://localhost:3000",
        "http://localhost:80",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/v1/health")
async def health():
    return {"status": "ok", "version": "3.0"}


@app.post("/api/v1/analyze")
async def analyze_resume(
    resume: UploadFile = File(...),
    jd_text: str = Form(...),
):
    if (
        not resume.filename
        or not resume.filename.lower().endswith(".pdf")
        or resume.content_type not in ("application/pdf", "application/octet-stream")
    ):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    if len(jd_text) > settings.MAX_JD_CHARS:
        raise HTTPException(
            status_code=400,
            detail=f"Job description exceeds {settings.MAX_JD_CHARS} character limit.",
        )

    # Check file size before writing to disk
    contents = await resume.read()
    max_bytes = settings.MAX_FILE_SIZE_MB * 1024 * 1024
    if len(contents) > max_bytes:
        raise HTTPException(
            status_code=400,
            detail=f"File exceeds {settings.MAX_FILE_SIZE_MB}MB limit.",
        )

    job_id = str(uuid.uuid4())
    file_path = os.path.join(settings.UPLOAD_DIR, f"{job_id}.pdf")

    with open(file_path, "wb") as f:
        f.write(contents)

    # Persist job record
    async with AsyncSessionLocal() as session:
        job = Job(id=uuid.UUID(job_id), status="pending")
        session.add(job)
        await session.commit()

    process_resume_task.apply_async(args=[job_id, file_path, jd_text], task_id=job_id)
    logger.info(f"Dispatched job {job_id}")

    return {"job_id": job_id}


@app.get("/api/v1/status/{job_id}")
async def get_status(job_id: str):
    res = AsyncResult(job_id)
    celery_state = res.state

    # Map Celery states → API contract states
    state_map = {
        "PENDING": "pending",
        "STARTED": "running",
        "RUNNING": "running",
        "SUCCESS": "completed",
        "FAILURE": "failed",
        "RETRY": "running",
    }
    status = state_map.get(celery_state, celery_state.lower())
    progress = 0
    if celery_state == "SUCCESS":
        progress = 100
    elif celery_state in ("STARTED", "RUNNING"):
        progress = res.info.get("progress", 30) if isinstance(res.info, dict) else 30

    return {"job_id": job_id, "status": status, "progress": progress}


@app.get("/api/v1/results/{job_id}")
async def get_results(job_id: str):
    try:
        uid = uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid job ID format.")

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Job).where(Job.id == uid))
        job = result.scalar_one_or_none()

    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")

    if job.status == "failed":
        raise HTTPException(status_code=422, detail=job.error_message or "Analysis failed.")

    if job.status != "completed":
        raise HTTPException(status_code=202, detail="Result not ready yet.")

    return {
        "job_id": job_id,
        "overall_score": job.overall_score,
        "matched_skills": job.matched_skills,
        "missing_skills": job.missing_skills,
        "experience_gap": job.experience_gap,
        "suggestions": job.suggestions,
        "summary": job.summary,
        "confidence": job.confidence,
    }
