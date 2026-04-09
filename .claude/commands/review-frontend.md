# Review Next.js Frontend

You are reviewing the Next.js 15 frontend for the Resume Analyzer project.

## Project Context
- Stack: Next.js 15, React 19, TypeScript, Tailwind CSS 4
- Pages: `/` (upload wizard), `/analyze/[id]` (results + polling)
- Key files: `frontend/src/app/page.tsx`, `frontend/src/app/analyze/[id]/page.tsx`, `frontend/src/components/`

## What to Review

Read all frontend files first, then check each area:

**1. Upload Page (`page.tsx`)**
- Is API URL read from `process.env.NEXT_PUBLIC_API_URL` with fallback to `http://localhost:8000/api`?
- Is `formData.append("resume", file)` used (not `formData.append("pdf", file)`)?
  - Note: FastAPI expects field name `"resume"` per the `/api/v1/analyze` contract
- Is file validated as PDF before submission?
- Is JD text trimmed before validation check?
- Is the submit button disabled while `isSubmitting`?
- On success, does it redirect to `/analyze/${data.job_id}`?
- Is error state shown to user (not just `console.error`)?

**2. Results Page (`analyze/[id]/page.tsx`)**
- Is `use(params)` used to unwrap the async params in Next.js 15?
- Is the API URL read from `process.env.NEXT_PUBLIC_API_URL`?
- Does polling check for `data.status === "completed"` (not `"SUCCESS"`)?
- Does polling stop on `"failed"` status (not loop forever)?
- Is the polling interval 2000ms?
- Is cleanup done properly (`isMounted` flag + `clearTimeout`)?
- Is the failure UI shown when `status === "failed"` (not `"FAILURE"`)?

**3. ResumeDropzone component**
- Does it reject non-PDF files with an inline error message?
- Does it support drag-and-drop?
- Does it call `onFileSelect(file)` with the selected file?
- Is the accepted MIME type `application/pdf`?

**4. JobDescTextArea component**
- Is there a character counter showing current / 20000?
- Is the `maxLength` enforced or just displayed?
- Does `onChange(value)` bubble up to parent?

**5. Environment**
- Is `NEXT_PUBLIC_API_URL` set in `docker-compose.yml` for the frontend service?
- Does `next.config.ts` have `output: "standalone"`?

**6. TypeScript**
- Is `AnalysisResult` interface complete (overall_score, matched_skills, missing_skills, experience_gap, suggestions, summary, confidence)?
- Are there any `any` types that should be typed properly?

**7. UX Concerns**
- Is there a max file size check client-side (10MB) before uploading?
- Is there feedback when analysis takes a long time (>30s)?
- Is the score gauge clamped to 0-100 to avoid SVG rendering bugs?

## Output Format

Report findings as **PASS / WARN / FAIL** per section. End with a prioritized fix list.
