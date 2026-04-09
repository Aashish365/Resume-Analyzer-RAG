from langgraph.graph import StateGraph, END
from langchain_opendataloader_pdf import OpenDataLoaderPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_ollama import ChatOllama
import chromadb

from app.core.config import settings
from app.core.embedding import encode_documents, encode_queries
from app.core.schema import GraphState, FullAnalysisOutput


ANALYSIS_PROMPT = """\
You are a senior technical recruiter and career coach. Evaluate the resume below \
against the job description and return a structured JSON analysis.

=== RESUME ===
{resume_text}

=== JOB DESCRIPTION ===
{jd_text}

=== RESUME SECTIONS MATCHED TO JOB REQUIREMENTS ===
{retrieved_context}

=== INSTRUCTIONS ===

SCORING RUBRIC — set overall_score using these bands:
  90-100 : Candidate meets nearly all requirements; strong, ready-to-hire fit
  75-89  : Candidate meets most requirements; minor gaps that are easy to close
  55-74  : Candidate meets several requirements; clear gaps that need work
  35-54  : Candidate meets some requirements; significant gaps present
  0-34   : Candidate is missing most key requirements

RULES — follow these exactly:
  - matched_skills : List ONLY skills/tools that appear in BOTH the resume AND the job description. Do not invent or infer.
  - missing_skills : List ONLY skills/tools the job description explicitly requires that are ABSENT from the resume. Do not invent.
  - experience_gap : If the JD asks for more years or a higher seniority than the resume shows, describe it briefly (e.g. "JD requires 5+ years, resume shows ~2 years"). Otherwise return null.
  - suggestions    : Write exactly 4 to 5 suggestions. Each must be a single, concrete action the candidate can take RIGHT NOW to improve this specific CV for this specific role. Bad example: "Improve your skills." Good example: "Add Kubernetes to your skills section — the JD lists it as a hard requirement and it is absent from your resume."
  - summary        : 2-3 sentences. State the candidate's overall fit, their strongest relevant area, and their most important gap.
  - confidence     : 0.9 if the resume is detailed and specific; 0.7 if it is moderate; 0.5 if it is vague or very short.

Return ONLY the JSON object below — no markdown, no explanation, no extra text:
{{
  "overall_score": 0,
  "matched_skills": [],
  "missing_skills": [],
  "experience_gap": null,
  "suggestions": [],
  "summary": "",
  "confidence": 0.0
}}
"""


def _chroma_client() -> chromadb.HttpClient:
    return chromadb.HttpClient(host=settings.CHROMA_HOST, port=settings.CHROMA_PORT)


# ── Nodes ─────────────────────────────────────────────────────────────────────

def parse_node(state: GraphState) -> dict:
    """Extract text from the uploaded PDF using OpenDataLoader (XY-Cut++ reading order)."""
    loader = OpenDataLoaderPDFLoader(
        file_path=[state["pdf_path"]],
        format="markdown",
        quiet=True,
    )
    docs = loader.load()
    resume_text = "\n\n".join(doc.page_content for doc in docs)
    return {"resume_text": resume_text}


def chunk_node(state: GraphState) -> dict:
    """Split resume and JD into overlapping token-based chunks."""
    splitter_resume = RecursiveCharacterTextSplitter.from_tiktoken_encoder(
        model_name="gpt2",
        chunk_size=400, chunk_overlap=50,
        separators=["## ", "# ", "\n\n", "\n", " ", ""],
    )
    splitter_jd = RecursiveCharacterTextSplitter.from_tiktoken_encoder(
        model_name="gpt2",
        chunk_size=300, chunk_overlap=40,
        separators=["\n", "•", "-", " ", ""],
    )

    resume_docs = splitter_resume.create_documents([state["resume_text"]])
    jd_docs = splitter_jd.create_documents([state["jd_text"]])

    return {
        "resume_chunks": [
            {"text": d.page_content, "metadata": {"source": "resume", "chunk_index": i}}
            for i, d in enumerate(resume_docs)
        ],
        "jd_chunks": [
            {"text": d.page_content, "metadata": {"source": "jd", "chunk_index": i}}
            for i, d in enumerate(jd_docs)
        ],
    }


def embed_node(state: GraphState) -> dict:
    """Embed resume and JD chunks into ChromaDB with pre-computed Harrier vectors.

    Embeddings are pre-computed and passed directly (embeddings= param) so
    ChromaDB stores the vectors as-is — no EmbeddingFunction wrapper needed.
    This lets Harrier apply different prompts to docs vs queries.
    """
    client = _chroma_client()
    job_id = state["job_id"]

    resume_texts = [c["text"] for c in state["resume_chunks"]]
    resume_col = client.get_or_create_collection(
        name=f"session_{job_id}_resume",
        metadata={"session_id": job_id, "hnsw:space": "cosine"},
    )
    if resume_texts:
        resume_col.add(
            documents=resume_texts,
            embeddings=encode_documents(resume_texts),
            metadatas=[{**c["metadata"], "session_id": job_id} for c in state["resume_chunks"]],
            ids=[f"res_{i}" for i in range(len(resume_texts))],
        )

    jd_texts = [c["text"] for c in state["jd_chunks"]]
    jd_col = client.get_or_create_collection(
        name=f"session_{job_id}_jd",
        metadata={"session_id": job_id, "hnsw:space": "cosine"},
    )
    if jd_texts:
        jd_col.add(
            documents=jd_texts,
            embeddings=encode_documents(jd_texts),
            metadatas=[{**c["metadata"], "session_id": job_id} for c in state["jd_chunks"]],
            ids=[f"jd_{i}" for i in range(len(jd_texts))],
        )

    return {"chroma_collection_id": f"session_{job_id}_resume"}


_REQUIREMENT_SIGNALS = frozenset({
    "required", "must", "should", "experience", "years", "proficient",
    "knowledge", "skill", "ability", "bachelor", "degree", "strong",
    "proven", "demonstrated", "expertise", "familiarity", "background",
    "responsible", "qualification", "preferred", "minimum", "ideally",
})


def _select_jd_queries(jd_chunks: list[dict], max_queries: int = 10) -> list[str]:
    """Return the most requirement-dense JD chunks as retrieval queries."""
    def _score(chunk: dict) -> int:
        words = chunk["text"].lower().split()
        return sum(1 for w in words if w.rstrip(".,;:") in _REQUIREMENT_SIGNALS)

    ranked = sorted(jd_chunks, key=_score, reverse=True)
    return [c["text"] for c in ranked[:max_queries]]


def retrieve_node(state: GraphState) -> dict:
    """Query the resume collection using requirement-rich JD chunks as queries.

    JD texts are encoded with the "sts_query" instruction (Harrier requirement
    for retrieval tasks). Finds resume sections most semantically similar to
    each JD requirement and assembles context for the analysis LLM.
    """
    client = _chroma_client()
    resume_col = client.get_collection(name=state["chroma_collection_id"])

    query_texts = _select_jd_queries(state["jd_chunks"], max_queries=10)
    if not query_texts:
        return {"retrieved_context": state["resume_text"][:5000]}

    query_embeddings = encode_queries(query_texts)

    n_results = min(3, max(1, len(state["resume_chunks"])))
    results = resume_col.query(query_embeddings=query_embeddings, n_results=n_results)

    seen: set[str] = set()
    passages: list[str] = []
    for doc_list in (results.get("documents") or []):
        for doc in (doc_list or []):
            if doc not in seen:
                seen.add(doc)
                passages.append(doc)

    return {"retrieved_context": "\n---\n".join(passages) or state["resume_text"][:5000]}


def analyze_node(state: GraphState) -> dict:
    """Single LLM call: scores the resume, identifies gaps, and produces
    specific CV improvement suggestions — all in one pass.

    Using one call instead of two (score + gap_analyze) halves latency and
    gives the model full context (resume + JD + retrieved sections) so
    suggestions are grounded in the actual content rather than just a list
    of missing skill names.
    """
    llm = ChatOllama(
        model=settings.OLLAMA_MODEL,
        base_url=settings.OLLAMA_BASE_URL,
        temperature=0.3,   # slight variation → more useful, non-generic suggestions
        format="json",
    ).with_structured_output(FullAnalysisOutput)

    prompt = ANALYSIS_PROMPT.format(
        resume_text=state["resume_text"][:6000],
        jd_text=state["jd_text"][:4000],
        retrieved_context=state["retrieved_context"][:3000],
    )
    result: FullAnalysisOutput = llm.invoke(prompt)

    return {
        "overall_score":  result.overall_score,
        "matched_skills": result.matched_skills,
        "missing_skills": result.missing_skills,
        "experience_gap": result.experience_gap or "",
        "suggestions":    result.suggestions,
        "summary":        result.summary,
        "confidence":     result.confidence,
    }


def cleanup_node(state: GraphState) -> dict:
    """Delete ChromaDB session collections after the job completes.

    Prevents unbounded collection accumulation and ensures no data from one
    job can leak into another.
    """
    try:
        client = _chroma_client()
        job_id = state["job_id"]
        for suffix in ("resume", "jd"):
            try:
                client.delete_collection(f"session_{job_id}_{suffix}")
            except Exception:
                pass  # Collection may not exist if pipeline failed before embed_node
    except Exception:
        pass  # Cleanup failure must never fail the job
    return {}


# ── Graph assembly ─────────────────────────────────────────────────────────────

def build_graph():
    workflow = StateGraph(GraphState)

    workflow.add_node("parse",    parse_node)
    workflow.add_node("chunk",    chunk_node)
    workflow.add_node("embed",    embed_node)
    workflow.add_node("retrieve", retrieve_node)
    workflow.add_node("analyze",  analyze_node)
    workflow.add_node("cleanup",  cleanup_node)

    workflow.set_entry_point("parse")
    workflow.add_edge("parse",    "chunk")
    workflow.add_edge("chunk",    "embed")
    workflow.add_edge("embed",    "retrieve")
    workflow.add_edge("retrieve", "analyze")
    workflow.add_edge("analyze",  "cleanup")
    workflow.add_edge("cleanup",  END)

    return workflow.compile()
