import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Float, DateTime, Text, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


class Job(Base):
    __tablename__ = "jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    status = Column(String(20), nullable=False, default="pending")  # pending|running|completed|failed
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Results — populated once Celery task completes
    overall_score = Column(Float, nullable=True)
    matched_skills = Column(JSON, nullable=True)    # List[str]
    missing_skills = Column(JSON, nullable=True)    # List[str]
    experience_gap = Column(Text, nullable=True)
    suggestions = Column(JSON, nullable=True)       # List[str]
    summary = Column(Text, nullable=True)
    confidence = Column(Float, nullable=True)
    error_message = Column(Text, nullable=True)
