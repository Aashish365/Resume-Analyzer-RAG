"""
Embedding utilities for the RAG pipeline.

Harrier (microsoft/harrier-oss-v1-0.6b) runs IN-PROCESS via sentence-transformers
inside the celery_worker container — no separate server needed.
The model is downloaded from HuggingFace on first use and cached at
~/.cache/huggingface (volume-mounted in docker-compose for persistence).

Key Harrier rule (from README):
  - Documents (resume chunks): encode with NO instruction
  - Queries   (JD chunks):     encode WITH prompt_name="sts_query"

We pass pre-computed embeddings directly to ChromaDB (embeddings= / query_embeddings=)
instead of using an EmbeddingFunction wrapper, so we can apply different prompts
to docs vs queries.

EMBEDDING_PROVIDER options:
  "harrier"  → microsoft/harrier-oss-v1-0.6b (default, 1024-dim, best quality)
  "ollama"   → nomic-embed-text via Ollama HTTP API (768-dim, no download needed)
  anything else → raises; set one of the above
"""
from __future__ import annotations

from functools import lru_cache
from typing import List

from app.core.config import settings


# ── Public API ────────────────────────────────────────────────────────────────

def encode_documents(texts: List[str]) -> List[List[float]]:
    """Embed resume chunks. No instruction — Harrier encodes docs as-is."""
    provider = settings.EMBEDDING_PROVIDER.lower()
    if provider == "harrier":
        return _harrier_encode(texts, prompt_name=None)
    if provider == "ollama":
        return _ollama_encode(texts)
    raise ValueError(f"Unknown EMBEDDING_PROVIDER: {settings.EMBEDDING_PROVIDER!r}")


def encode_queries(texts: List[str]) -> List[List[float]]:
    """Embed JD query texts. Harrier requires the sts_query instruction for retrieval."""
    provider = settings.EMBEDDING_PROVIDER.lower()
    if provider == "harrier":
        return _harrier_encode(texts, prompt_name="sts_query")
    if provider == "ollama":
        return _ollama_encode(texts)
    raise ValueError(f"Unknown EMBEDDING_PROVIDER: {settings.EMBEDDING_PROVIDER!r}")


# ── Harrier (in-process, sentence-transformers) ───────────────────────────────

@lru_cache(maxsize=1)
def _harrier_model():
    """Load the Harrier model once per process and cache it."""
    from sentence_transformers import SentenceTransformer
    return SentenceTransformer(
        settings.HARRIER_MODEL,
        model_kwargs={"dtype": "auto"},   # fp16 on GPU, fp32 on CPU
    )


def _harrier_encode(texts: List[str], prompt_name: str | None) -> List[List[float]]:
    model = _harrier_model()
    kwargs = dict(
        normalize_embeddings=True,
        show_progress_bar=False,
        # num_workers=0: disable DataLoader multiprocessing — spawning sub-processes
        # inside a Celery fork-pool worker causes a deadlock on Linux.
        num_workers=0,
        batch_size=32,
    )
    if prompt_name:
        kwargs["prompt_name"] = prompt_name
    return model.encode(texts, **kwargs).tolist()


# ── Ollama fallback (nomic-embed-text) ────────────────────────────────────────

def _ollama_encode(texts: List[str]) -> List[List[float]]:
    import httpx
    base_url = settings.OLLAMA_BASE_URL.rstrip("/")
    embeddings: List[List[float]] = []
    for text in texts:
        resp = httpx.post(
            f"{base_url}/api/embeddings",
            json={"model": "nomic-embed-text", "prompt": text},
            timeout=30,
        )
        resp.raise_for_status()
        embeddings.append(resp.json()["embedding"])
    return embeddings
