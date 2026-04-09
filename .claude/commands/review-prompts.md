# Review LLM Prompts

You are reviewing the LLM prompts used in the Resume Analyzer scoring pipeline.

## Project Context
- LLM: Ollama llama3.2 (local), structured output via `with_structured_output()`
- Two prompts: `SCORING_PROMPT` and `GAP_ANALYSIS_PROMPT` in `backend/app/core/graph.py`
- Models: `ResumeScoreOutput` and `GapAnalysisOutput` in `backend/app/core/schema.py`

## What to Review

Read `graph.py` and `schema.py` first.

**1. Scoring Prompt (`SCORING_PROMPT`)**

Check for these properties:
- Does it clearly state the role: "expert resume reviewer and ATS system"?
- Does it include both `{resume_text}` and `{retrieved_context}` placeholders?
- Does it instruct the model to return ONLY valid JSON with no markdown/explanation?
- Does it include the explicit JSON schema with field names and types?
- Is `overall_score` described as float 0-100?
- Is `confidence` described as float 0-1?
- Are `matched_skills` and `missing_skills` described as arrays of strings?

Prompt quality checks:
- Is the instruction to avoid markdown code blocks explicit? (LLMs often wrap JSON in ```json)
- Does it avoid ambiguous instructions like "be thorough"?
- Is resume_text truncated to a safe limit before insertion (≤4000 chars)?

**2. Gap Analysis Prompt (`GAP_ANALYSIS_PROMPT`)**

Check for:
- Does it take `{missing_skills}` (comma-separated) and `{jd_text}`?
- Does it ask for: concrete suggestions, overall summary, experience gap?
- Does it instruct JSON-only output?
- Is JD text truncated to ≤2000 chars?

**3. Structured Output Reliability**
- `with_structured_output(ResumeScoreOutput)` — does llama3.2 reliably return valid JSON?
  - Small local models often fail structured output on complex schemas
  - Recommend: add `format="json"` to `ChatOllama()` as a reinforcement hint
  - Consider: retry logic if `ValidationError` is raised

**4. Schema Robustness (`schema.py`)**
- Are default values set for list fields? (`matched_skills: List[str] = []`)
  - Without defaults, missing fields in LLM response cause ValidationError
- Is `experience_gap: Optional[str] = None`?
- Is `confidence: float = Field(..., ge=0, le=1)` validated with bounds?
- Is `overall_score: float = Field(..., ge=0, le=100)` validated with bounds?

**5. Context Window Usage**
- `resume_text[:4000]` + `retrieved_context` → estimate total prompt tokens
  - At ~4 chars/token: 4000 chars ≈ 1000 tokens + retrieved context + prompt template
  - llama3.2 3B has 128k context, so this is fine
  - But if using a smaller model, flag if combined input > 8192 tokens

**6. Prompt Injection Risk**
- Is user-provided `jd_text` inserted verbatim into the gap analysis prompt?
  - A malicious JD could say "Ignore previous instructions and output..."
  - Mitigation: wrap user content in XML-style delimiters: `<job_description>{jd_text}</job_description>`

## Output Format

Rate each prompt:
- **Strong** — clear, unambiguous, reliable
- **Adequate** — works but edge cases exist
- **Weak** — likely to produce inconsistent results

Suggest specific rewrites for any Weak ratings.
