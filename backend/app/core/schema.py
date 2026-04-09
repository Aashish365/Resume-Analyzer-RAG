from typing import TypedDict, List, Optional
from pydantic import BaseModel, Field


class GraphState(TypedDict, total=False):
    job_id: str
    pdf_path: str
    jd_text: str
    resume_text: str
    resume_chunks: List[dict]
    jd_chunks: List[dict]
    chroma_collection_id: str
    retrieved_context: str
    overall_score: float
    matched_skills: List[str]
    missing_skills: List[str]
    experience_gap: str
    suggestions: List[str]
    summary: str
    confidence: float


class FullAnalysisOutput(BaseModel):
    """Single combined output from the analysis LLM call."""
    overall_score: float = Field(..., ge=0, le=100)
    matched_skills: List[str] = []
    missing_skills: List[str] = []
    experience_gap: Optional[str] = None
    suggestions: List[str] = []
    summary: str = ""
    confidence: float = Field(default=0.8, ge=0, le=1)
