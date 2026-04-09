# Debug Pipeline

You are helping debug the LangGraph analysis pipeline for the Resume Analyzer project.

## Project Context
- Pipeline: parse → chunk → embed → retrieve → score → gap_analyze
- Runs inside Celery worker container
- Services it depends on: ChromaDB (:8001 external, :8000 internal), Ollama (:11434)
- Key files: `backend/app/core/graph.py`, `backend/app/core/embedding.py`

## Debugging Approach

The user may describe a symptom or error. Follow this checklist to diagnose:

### Step 1 — Identify the failing node
Ask which node is failing, or look at the error traceback. Each node has a distinct failure mode:
- **parse**: OpenDataLoader/JVM error, bad PDF path, unreadable file
- **chunk**: Empty resume_text, splitter import error
- **embed**: ChromaDB connection refused, sentence-transformers download issue, CUDA/MPS error
- **retrieve**: Collection not found, empty query_texts, dimension mismatch
- **score**: Ollama connection refused, LLM returns malformed JSON, structured output parse failure
- **gap_analyze**: Same as score

### Step 2 — Check service connectivity
```bash
# From inside celery_worker container:
curl http://chromadb:8000/api/v1/heartbeat
curl http://ollama:11434/api/tags
```

### Step 3 — Common failure patterns

**ChromaDB dimension mismatch**
- Symptom: `InvalidDimensionException` on `collection.query()`
- Cause: Collection was created with different embedding model
- Fix: Delete the collection and re-embed; check EMBEDDING_PROVIDER consistency

**Harrier model download failure**
- Symptom: `OSError: Can't load tokenizer for 'microsoft/harrier-oss-v1-0.6b'`
- Cause: No internet access or HF_HOME not writable
- Fix: Check `./volumes/hf_cache` is mounted and writable; check HuggingFace connectivity

**Ollama structured output failure**
- Symptom: `ValidationError` on `ResumeScoreOutput` or `GapAnalysisOutput`
- Cause: LLM returned malformed JSON despite `with_structured_output()`
- Fix: Add `format="json"` to `ChatOllama()`; check llama3.2 supports JSON mode

**Celery task not picked up**
- Symptom: Job stuck in "pending" forever
- Fix: Check celery_worker logs (`docker compose logs celery_worker`); verify broker URL is `redis://redis:6379/0`

**PDF path not found**
- Symptom: `FileNotFoundError` in parse_node
- Cause: `UPLOAD_DIR` in backend and celery_worker point to different paths
- Fix: Both must mount `./volumes/uploads:/app/uploads`

**Empty retrieved_context**
- Symptom: Score LLM returns low scores with no reasoning
- Cause: retrieve_node fell back to `resume_text[:3000]` or ChromaDB returned empty
- Fix: Check embed_node actually added documents; add logging to retrieve_node

### Step 4 — Inspect ChromaDB state
```python
import chromadb
client = chromadb.HttpClient(host="localhost", port=8001)
print(client.list_collections())
col = client.get_collection("session_{job_id}_resume")
print(col.count())
```

### Step 5 — Test embedding locally
```python
from backend.app.core.embedding import encode_documents, encode_queries
docs = encode_documents(["Python developer with FastAPI experience"])
queries = encode_queries(["Looking for Python backend developer"])
print(len(docs[0]))  # Should be 1024 for Harrier
```

## Response Format
1. State the most likely failing node based on the symptom
2. Provide the exact diagnostic command to confirm
3. Provide the fix with code if applicable
