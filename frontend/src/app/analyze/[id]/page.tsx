"use client";
import { useEffect, useState, use } from "react";
import Link from "next/link";

interface AnalysisResult {
  overall_score: number;
  matched_skills: string[];
  missing_skills: string[];
  experience_gap: string;
  suggestions: string[];
  summary: string;
  confidence: number;
}

export default function AnalyzeResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [status, setStatus] = useState<string>("pending");
  const [progress, setProgress] = useState<number>(0);
  const [progressMessage, setProgressMessage] = useState<string>("Initializing…");
  const [result, setResult] = useState<AnalysisResult | null>(null);

  useEffect(() => {
    if (!id) return;
    let isMounted = true;
    let timeoutId: NodeJS.Timeout;

    const pollStatus = async () => {
      try {
        const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";
        const res = await fetch(`${apiBase}/v1/status/${id}`);
        const data = await res.json();
        if (!isMounted) return;

        setStatus(data.status);
        setProgress(data.progress ?? 0);
        if (data.message) setProgressMessage(data.message);

        if (data.status === "completed") {
          const resultRes = await fetch(`${apiBase}/v1/results/${id}`);
          if (resultRes.status === 200) {
            setResult(await resultRes.json());
          } else {
            timeoutId = setTimeout(pollStatus, 2000);
          }
        } else if (data.status === "failed") {
          // stop polling
        } else {
          timeoutId = setTimeout(pollStatus, 2000);
        }
      } catch {
        timeoutId = setTimeout(pollStatus, 2000);
      }
    };

    pollStatus();
    return () => { isMounted = false; clearTimeout(timeoutId); };
  }, [id]);

  // ── FAILED ───────────────────────────────────────────────────────────────
  if (status === "failed") {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-8">
        <div className="bg-[var(--surface)] rounded-2xl p-10 max-w-sm w-full text-center animate-rise"
          style={{ boxShadow: "var(--shadow-lg)" }}>
          <div className="w-12 h-12 mx-auto mb-5 flex items-center justify-center rounded-full bg-[var(--red-light)]">
            <svg className="w-5 h-5 text-[var(--red)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-[var(--text-primary)] mb-2">Pipeline failed</h1>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-7">
            An error occurred while processing your résumé. Check server logs for details.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors"
          >
            ← Back to upload
          </Link>
        </div>
      </div>
    );
  }

  // ── LOADING ──────────────────────────────────────────────────────────────
  if (status !== "completed" || !result) {
    const nodes = [
      { label: "Parse Resume",    threshold: 20 },
      { label: "Chunk",           threshold: 38 },
      { label: "Embed Vectors",   threshold: 58 },
      { label: "Retrieve",        threshold: 74 },
      { label: "Analyze & Score", threshold: 92 },
    ];

    return (
      <div className="min-h-screen bg-[var(--surface)] flex flex-col">
        {/* Top progress bar */}
        <div className="h-[3px] bg-[var(--border)]">
          <div
            className="h-full bg-[var(--accent)] transition-all duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-sm animate-rise">

            {/* Percentage */}
            <div className="text-center mb-10">
              <p className="font-mono text-xs font-medium tracking-widest uppercase text-[var(--text-dim)] mb-4">
                Running Pipeline
              </p>
              <div className="flex items-baseline justify-center gap-1">
                <span
                  className="font-extrabold tabular-nums leading-none text-[var(--accent)]"
                  style={{ fontSize: "clamp(80px, 16vw, 112px)" }}
                >
                  {progress}
                </span>
                <span className="text-3xl font-bold text-[var(--text-dim)]">%</span>
              </div>
              <p className="mt-3 text-sm text-[var(--text-secondary)]">{progressMessage}</p>
            </div>

            {/* Track */}
            <div className="w-full h-2 bg-[var(--bg)] rounded-full mb-8 overflow-hidden">
              <div
                className="h-full bg-[var(--accent)] rounded-full transition-all duration-700 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Steps */}
            <div className="flex flex-col gap-3">
              {nodes.map(({ label, threshold }) => {
                const done = progress >= threshold;
                return (
                  <div key={label} className="flex items-center gap-3">
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all duration-300"
                      style={{
                        background: done ? "var(--accent)" : "var(--bg)",
                        border: done ? "none" : "2px solid var(--border-strong)",
                      }}
                    >
                      {done && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span
                      className="text-sm font-medium transition-colors duration-300"
                      style={{ color: done ? "var(--text-primary)" : "var(--text-dim)" }}
                    >
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── RESULTS ──────────────────────────────────────────────────────────────
  const score = Math.round(result.overall_score);
  const scoreColor =
    score >= 75 ? "var(--green)"
    : score >= 50 ? "var(--accent)"
    : "var(--red)";
  const scoreBg =
    score >= 75 ? "var(--green-light)"
    : score >= 50 ? "var(--accent-light)"
    : "var(--red-light)";
  const scoreBorder =
    score >= 75 ? "#bbf7d0"
    : score >= 50 ? "#bfdbfe"
    : "#fecaca";
  const scoreLabel =
    score >= 75 ? "Strong match"
    : score >= 50 ? "Partial match"
    : "Weak match";

  return (
    <div className="min-h-screen bg-[var(--bg)]">

      {/* Nav */}
      <header className="sticky top-0 z-20 bg-[var(--surface)] border-b border-[var(--border)]"
        style={{ boxShadow: "var(--shadow-sm)" }}>
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/"
            className="flex items-center gap-2 font-semibold text-sm text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Resume Analyzer
          </Link>
          <span className="font-mono text-xs text-[var(--text-dim)]">
            Job {id.slice(0, 8)}
          </span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">

        {/* ── Score card ─────────────────────────────────────────────── */}
        <div
          className="animate-rise rounded-2xl p-8 mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6"
          style={{ background: scoreBg, border: `1px solid ${scoreBorder}` }}
        >
          <div>
            <p className="font-mono text-xs font-medium tracking-widest uppercase mb-3"
              style={{ color: scoreColor }}>
              {scoreLabel}
            </p>
            <div className="flex items-baseline gap-2">
              <span
                className="font-extrabold tabular-nums leading-none"
                style={{ fontSize: "clamp(64px, 10vw, 88px)", color: scoreColor }}
              >
                {score}
              </span>
              <span className="text-2xl font-bold text-[var(--text-dim)]">/100</span>
            </div>
          </div>

          <div className="sm:text-right">
            <p className="font-mono text-xs tracking-widest uppercase text-[var(--text-dim)] mb-1">
              Confidence
            </p>
            <p className="text-3xl font-bold" style={{ color: scoreColor }}>
              {(result.confidence * 100).toFixed(0)}%
            </p>
          </div>
        </div>

        {/* ── Main grid ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 animate-rise animate-rise-1">

          {/* Left col — Summary + Gap */}
          <div className="lg:col-span-2 space-y-5">

            {/* Summary */}
            <div className="bg-[var(--surface)] rounded-2xl p-6" style={{ boxShadow: "var(--shadow-md)" }}>
              <h3 className="font-semibold text-sm text-[var(--text-primary)] mb-3 flex items-center gap-2">
                <span className="w-1 h-4 rounded-full bg-[var(--accent)] inline-block" />
                Summary
              </h3>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{result.summary}</p>
            </div>

            {/* Experience gap */}
            {result.experience_gap && (
              <div className="bg-[var(--surface)] rounded-2xl p-6" style={{ boxShadow: "var(--shadow-md)" }}>
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"
                  style={{ color: "var(--orange)" }}>
                  <span className="w-1 h-4 rounded-full inline-block" style={{ background: "var(--orange)" }} />
                  Experience Gap
                </h3>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  {result.experience_gap}
                </p>
              </div>
            )}
          </div>

          {/* Right col — Skills + Suggestions */}
          <div className="lg:col-span-3 space-y-5">

            {/* Skills grid */}
            <div className="bg-[var(--surface)] rounded-2xl p-6" style={{ boxShadow: "var(--shadow-md)" }}>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold text-sm text-[var(--text-primary)] mb-3 flex items-center gap-2">
                    <span className="w-1 h-4 rounded-full bg-[var(--green)] inline-block" />
                    Matched
                    <span className="font-mono text-xs font-normal text-[var(--text-dim)]">
                      ({result.matched_skills.length})
                    </span>
                  </h3>
                  {result.matched_skills.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {result.matched_skills.map((skill, i) => (
                        <span
                          key={i}
                          className="px-2.5 py-1 rounded-full text-xs font-medium"
                          style={{ background: "var(--green-light)", color: "var(--green)" }}
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--text-dim)]">None identified</p>
                  )}
                </div>

                <div>
                  <h3 className="font-semibold text-sm text-[var(--text-primary)] mb-3 flex items-center gap-2">
                    <span className="w-1 h-4 rounded-full bg-[var(--red)] inline-block" />
                    Missing
                    <span className="font-mono text-xs font-normal text-[var(--text-dim)]">
                      ({result.missing_skills.length})
                    </span>
                  </h3>
                  {result.missing_skills.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {result.missing_skills.map((skill, i) => (
                        <span
                          key={i}
                          className="px-2.5 py-1 rounded-full text-xs font-medium"
                          style={{ background: "var(--red-light)", color: "var(--red)" }}
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--text-dim)]">None identified</p>
                  )}
                </div>
              </div>
            </div>

            {/* Suggestions */}
            <div className="bg-[var(--surface)] rounded-2xl p-6" style={{ boxShadow: "var(--shadow-md)" }}>
              <h3 className="font-semibold text-sm text-[var(--text-primary)] mb-5 flex items-center gap-2">
                <span className="w-1 h-4 rounded-full bg-[var(--accent)] inline-block" />
                How to improve your CV for this role
              </h3>
              {result.suggestions.length > 0 ? (
                <ol className="space-y-4">
                  {result.suggestions.map((s, i) => (
                    <li key={i} className="flex gap-4 items-start">
                      <span
                        className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 mt-0.5"
                        style={{ background: "var(--accent)" }}
                      >
                        {i + 1}
                      </span>
                      <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{s}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-[var(--text-dim)]">No recommendations generated.</p>
              )}
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
