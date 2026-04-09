from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import settings
from app.db.models import Base


# Async engine for FastAPI endpoints
async_engine = create_async_engine(settings.DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(async_engine, expire_on_commit=False)


async def create_tables():
    """Create all tables on startup."""
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


# Sync engine for Celery workers (psycopg2 driver)
def _make_sync_url(url: str) -> str:
    """Convert asyncpg URL to psycopg2 for sync use in Celery."""
    return url.replace("postgresql+asyncpg://", "postgresql+psycopg2://")


sync_engine = create_engine(_make_sync_url(settings.DATABASE_URL), echo=False)
SyncSessionLocal = sessionmaker(sync_engine, expire_on_commit=False)
