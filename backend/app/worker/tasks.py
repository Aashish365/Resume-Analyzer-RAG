import os
import uuid
from datetime import datetime, timezone
from functools import lru_cache

from loguru import logger

from app.core.celery_app import celery_app
from app.core.graph import build_graph
from app.db.database import SyncSessionLocal
from app.db.models import Job


_NODE_PROGRESS = {
    "parse":    20,
    "chunk":    38,
    "embed":    58,
    "retrieve": 74,
    "analyze":  92,
    "cleanup":  99,
}

_NODE_MESSAGES = {
    "parse":    "Parsing resume…",
    "chunk":    "Chunking documents…",
    "embed":    "Embedding into vector store…",
    "retrieve": "Retrieving relevant sections…",
    "analyze":  "Analyzing fit and generating suggestions…",
    "cleanup":  "Finalizing…",
}


@lru_cache(maxsize=1)
def _get_graph():
    """Compile the LangGraph pipeline once per worker process."""
    return build_graph()


def _update_job(session, job_id: str, **kwargs):
    job = session.get(Job, uuid.UUID(job_id))
    if job:
        for k, v in kwargs.items():
            setattr(job, k, v)
        job.updated_at = datetime.now(timezone.utc)
        session.commit()


@celery_app.task(bind=True, name="analyze_resume")
def process_resume_task(self, job_id: str, pdf_path: str, jd_text: str):
    graph = _get_graph()

    with SyncSessionLocal() as session:
        _update_job(session, job_id, status="running")

    self.update_state(state="RUNNING", meta={"progress": 5, "message": "Pipeline started…"})

    try:
        initial_state = {"job_id": job_id, "pdf_path": pdf_path, "jd_text": jd_text}

        accumulated: dict = {}
        for event in graph.stream(initial_state, stream_mode="updates"):
            # LangGraph can emit None or non-dict sentinel values at stream boundaries
            if not isinstance(event, dict):
                continue

            node_name = next(iter(event), None)
            if not node_name:
                continue

            node_update = event.get(node_name)
            if isinstance(node_update, dict):
                accumulated.update(node_update)

            progress = _NODE_PROGRESS.get(node_name, 50)
            message  = _NODE_MESSAGES.get(node_name, f"Completed: {node_name}")
            self.update_state(
                state="RUNNING",
                meta={"progress": progress, "message": message},
            )
            logger.debug(f"Job {job_id} — node '{node_name}' done ({progress}%)")

        final_output = {
            "job_id":         job_id,
            "overall_score":  accumulated.get("overall_score"),
            "matched_skills": accumulated.get("matched_skills"),
            "missing_skills": accumulated.get("missing_skills"),
            "experience_gap": accumulated.get("experience_gap"),
            "suggestions":    accumulated.get("suggestions"),
            "summary":        accumulated.get("summary"),
            "confidence":     accumulated.get("confidence"),
        }

        with SyncSessionLocal() as session:
            _update_job(
                session, job_id,
                status="completed",
                overall_score=final_output["overall_score"],
                matched_skills=final_output["matched_skills"],
                missing_skills=final_output["missing_skills"],
                experience_gap=final_output["experience_gap"],
                suggestions=final_output["suggestions"],
                summary=final_output["summary"],
                confidence=final_output["confidence"],
            )

        logger.info(f"Job {job_id} completed — score: {final_output['overall_score']}")
        return final_output

    except Exception as exc:
        logger.error(f"Job {job_id} failed: {exc}")
        with SyncSessionLocal() as session:
            _update_job(session, job_id, status="failed", error_message=str(exc))
        raise

    finally:
        try:
            if os.path.exists(pdf_path):
                os.remove(pdf_path)
        except OSError as e:
            logger.warning(f"Could not delete upload {pdf_path}: {e}")
