# Optimize Embeddings & Retrieval

You are reviewing the embedding and retrieval quality for the Resume Analyzer project.

## Project Context
- Embedding model: microsoft/harrier-oss-v1-0.6b (1024-dim, L2-normalized)
- Vector store: ChromaDB with cosine distance
- Retrieval: top-3 results per JD query chunk, up to 5 JD queries
- Key files: `backend/app/core/embedding.py`, `backend/app/core/graph.py`

## What to Review

**1. Embedding Correctness**
- `encode_documents()`: no instruction, `normalize_embeddings=True` → correct
- `encode_queries()`: `prompt_name="sts_query"`, `normalize_embeddings=True` → correct
- `model_kwargs={"dtype": "auto"}` → fp16 on GPU, fp32 on CPU → correct
- Is `@lru_cache(maxsize=1)` on `_harrier_model()` so model loads once per process?

**2. ChromaDB Collection Config**
- Is `metadata={"hnsw:space": "cosine"}` set on collection creation?
  - Without this, ChromaDB uses L2 distance by default — wrong for normalized vectors
- Are both `_resume` and `_jd` collections using cosine?

**3. Retrieval Strategy**
- `n_results=3` per query, up to 5 JD chunks = max 15 candidates before dedup
  - Is this sufficient? For long JDs (20k chars → ~67 chunks), only first 5 are used
  - Consider: rank JD chunks by information density and pick top 5 instead of first 5
- Deduplication: is `seen` set working correctly (exact string match)?
  - Near-duplicate chunks (slightly different text) won't be deduped — acceptable

**4. Chunk Quality**
- Resume chunker: 400 tokens, `["## ", "# ", "\n\n", "\n", " ", ""]` separators
  - Are markdown headers preserved at chunk boundaries? (depends on RecursiveCharacterTextSplitter behavior)
  - Recommend: verify by printing first 3 chunks of a sample resume

**5. Context Assembly**
- Retrieved passages joined with `"\n---\n"` — good separator for LLM context
- Fallback to `resume_text[:3000]` when retrieval returns nothing
  - Is 3000 chars enough? Resume could be 5+ pages = 5000+ chars
  - Consider: increase fallback to 5000 chars

**6. Missing Optimization Opportunities**
- **Reranking**: after initial retrieval, use a cross-encoder to rerank passages
  - `cross-encoder/ms-marco-MiniLM-L-6-v2` is lightweight and effective
- **MMR (Maximal Marginal Relevance)**: reduce redundant passages in context
  - ChromaDB doesn't support MMR natively; implement manually or use LangChain's wrapper
- **Score Threshold**: filter out low-similarity results (cosine < 0.3)
  - Prevents irrelevant passages from confusing the scoring LLM

## Recommendations

For each finding, output:
- **Current behavior** — what the code does now
- **Impact** — how this affects resume scoring quality
- **Suggested change** — specific code edit with before/after

Focus on changes that improve retrieval precision without adding heavy dependencies.
