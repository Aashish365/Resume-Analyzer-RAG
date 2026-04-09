from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "llama3.2"

    EMBEDDING_PROVIDER: str = "harrier"
    HARRIER_MODEL: str = "microsoft/harrier-oss-v1-0.6b"

    CHROMA_HOST: str = "localhost"
    CHROMA_PORT: int = 8001

    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/1"

    DATABASE_URL: str = "postgresql+asyncpg://resumeanalyzer:changeme@localhost:5432/resumeanalyzer"

    UPLOAD_DIR: str = "./uploads"
    MAX_FILE_SIZE_MB: int = 10
    MAX_JD_CHARS: int = 20000

    model_config = {"env_file": ".env", "extra": "ignore"}

settings = Settings()
