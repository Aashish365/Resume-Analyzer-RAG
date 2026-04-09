# Review RAG Pipeline

You are reviewing the LangGraph RAG pipeline for the Resume Analyzer project.

## Project Context
- Stack: LangGraph → OpenDataLoader PDF → sentence-transformers (Harrier 0.6B, 1024-dim) → ChromaDB → Ollama (llama3.2)
- Pipeline: parse → chunk → embed → retrieve → score → gap_analyze
- Key files: `backend/app/core/graph.py`, `backend/app/core/embedding.py`, `backend/app/core/schema.py`

## What to Review

Read these files first, then audit each area:

**1. Parse Node** (`parse_node`)
- Is OpenDataLoaderPDFLoader called correctly? (`file_path` must be a list, `format="markdown"`)
- Is the output joined with `\n\n` to preserve section gaps?

**2. Chunk Node** (`chunk_node`)
- Resume: 400 tokens / 50 overlap, markdown-aware separators (`## `, `# ` first)
- JD: 300 tokens / 40 overlap, bullet-aware separators (`\n`, `•`, `-`)
- Are chunks stored as `{"text": ..., "metadata": {"source": ..., "chunk_index": i}}`?

**3. Embed Node** (`embed_node`)
- Are TWO collections created: `session_{job_id}_resume` AND `session_{job_id}_jd`?
- Are embeddings pre-computed with `encode_documents()` (no instruction prompt)?
- Are embeddings passed as `embeddings=` param (not relying on ChromaDB EF)?
- Is cosine distance set: `metadata={"hnsw:space": "cosine"}`?

**4. Retrieve Node** (`retrieve_node`)
- Are JD chunks encoded with `encode_queries()` (uses `sts_query` instruction)?
- Are `query_embeddings=` passed directly (not `query_texts=`)?
- Is deduplication done via a `seen` set?
- Fallback to `resume_text[:3000]` when no passages returned?

**5. Score Node** (`score_node`)
- Is `with_structured_output(ResumeScoreOutput)` used?
- Does the prompt include both `{resume_text}` and `{retrieved_context}`?
- Is resume_text truncated to ≤4000 chars?

**6. Gap Analyze Node** (`gap_analyze_node`)
- Is `with_structured_output(GapAnalysisOutput)` used?
- Does it use `missing_skills` from score node?
- Is experience_gap correctly preferring the score node's value?

**7. embedding.py**
- Is `encode_documents()` used for docs (no prompt)?
- Is `encode_queries()` using `prompt_name="sts_query"` for Harrier?
- Is `_harrier_model()` decorated with `@lru_cache(maxsize=1)` to avoid reloading?
- Does Ollama fallback use httpx with timeout=30?

**8. Schema**
- `GraphState`: all 6 pipeline fields present + `job_id`, `pdf_path`, `jd_text`?
- `ResumeScoreOutput`: `overall_score` (float 0-100), `confidence` (float 0-1)?
- `GapAnalysisOutput`: `suggestions` (list), `summary` (str), `experience_gap` (optional str)?

## Output Format

Report findings as:
- **PASS** — correct and aligned with spec
- **WARN** — works but could be improved
- **FAIL** — bug or spec deviation, include the fix

End with a prioritized fix list if any FAILs found.
