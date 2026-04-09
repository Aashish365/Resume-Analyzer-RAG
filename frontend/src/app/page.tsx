"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import ResumeDropzone from "@/components/ResumeDropzone";
import JobDescTextArea from "@/components/JobDescTextArea";

export default function Home() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [jdText, setJdText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!file || !jdText.trim()) return;
    setIsSubmitting(true);
    const formData = new FormData();
    formData.append("resume", file);
    formData.append("jd_text", jdText);
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";
      const res = await fetch(`${apiBase}/v1/analyze`, { method: "POST", body: formData });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      router.push(`/analyze/${data.job_id}`);
    } catch (err) {
      console.error(err);
      alert("An error occurred during submission.");
      setIsSubmitting(false);
    }
  };

  const ready = !!file && !!jdText.trim() && !isSubmitting;

  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col lg:flex-row">

      {/* ── Left — brand panel ──────────────────────────────────────────── */}
      <aside className="lg:w-[42%] lg:min-h-screen bg-[var(--surface)] flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-[var(--border)]">
        {/* Blue accent bar */}
        <div className="flex flex-row h-full">
          <div className="w-[6px] shrink-0 bg-[var(--accent)]" />

          <div className="flex-1 flex flex-col justify-between p-10 md:p-12 lg:p-14 dot-grid">
            <div>
              {/* Label */}
              <div className="animate-rise">
                <span className="inline-flex items-center gap-2 font-mono text-xs font-medium tracking-widest uppercase text-[var(--accent)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] inline-block" />
                  Resume Intelligence
                </span>
              </div>

              {/* Heading */}
              <h1 className="animate-rise animate-rise-1 mt-8 font-sans leading-none tracking-tight">
                <span
                  className="block font-extrabold text-[var(--text-primary)]"
                  style={{ fontSize: "clamp(52px, 6.5vw, 80px)" }}
                >
                  Resume
                </span>
                <span
                  className="block font-extrabold text-[var(--accent)]"
                  style={{ fontSize: "clamp(52px, 6.5vw, 80px)" }}
                >
                  Analyzer
                </span>
              </h1>

              <p className="animate-rise animate-rise-2 mt-6 text-base text-[var(--text-secondary)] leading-relaxed max-w-[340px]">
                Upload your résumé and paste a job description. The AI pipeline
                identifies skill gaps and tells you exactly how to improve your
                CV for the role.
              </p>
            </div>

            {/* Tech stack */}
            <div className="animate-rise animate-rise-3 hidden lg:block mt-12">
              <p className="font-mono text-xs tracking-widest uppercase text-[var(--text-dim)] mb-4">
                Powered by
              </p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Llama 3.2",    sub: "via Ollama" },
                  { label: "Harrier 0.6B", sub: "Embeddings" },
                  { label: "LangGraph",    sub: "RAG Pipeline" },
                  { label: "ChromaDB",     sub: "Vector Store" },
                ].map(({ label, sub }) => (
                  <div
                    key={label}
                    className="px-3 py-2.5 bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg"
                  >
                    <p className="font-semibold text-sm text-[var(--text-primary)]">{label}</p>
                    <p className="font-mono text-xs text-[var(--text-dim)] mt-0.5">{sub}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Right — form panel ──────────────────────────────────────────── */}
      <main className="flex-1 bg-[var(--bg)] flex items-center justify-center p-8 md:p-12 lg:p-14">
        <div className="w-full max-w-[520px]">

          {/* Form card */}
          <div
            className="bg-[var(--surface)] rounded-2xl p-8"
            style={{ boxShadow: "var(--shadow-lg)" }}
          >
            <div className="mb-7">
              <h2 className="text-xl font-bold text-[var(--text-primary)]">Start your analysis</h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Both fields are required to run the pipeline.
              </p>
            </div>

            <div className="space-y-6 animate-rise">
              <div>
                <label className="block font-mono text-xs font-medium tracking-widest uppercase text-[var(--text-secondary)] mb-2">
                  01 — Resume PDF
                </label>
                <ResumeDropzone onFileSelect={setFile} />
              </div>

              <div>
                <label className="block font-mono text-xs font-medium tracking-widest uppercase text-[var(--text-secondary)] mb-2">
                  02 — Job Description
                </label>
                <JobDescTextArea jdText={jdText} onChange={setJdText} />
              </div>

              <button
                onClick={handleSubmit}
                disabled={!ready}
                className={`w-full py-3.5 rounded-xl font-semibold text-sm tracking-wide transition-all duration-150
                  ${ready
                    ? "bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] active:scale-[0.98] shadow-md"
                    : "bg-[var(--surface-raised)] text-[var(--text-dim)] cursor-not-allowed border border-[var(--border)]"
                  }`}
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Analyzing…
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    Run Analysis
                    {ready && <span className="text-white/70">→</span>}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Footer note */}
          <p className="mt-4 text-center font-mono text-xs text-[var(--text-dim)] tracking-wide">
            Results typically ready in 30–60 seconds
          </p>
        </div>
      </main>
    </div>
  );
}
