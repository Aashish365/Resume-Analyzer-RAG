"use client";
import { useState } from "react";

interface Props {
  jdText: string;
  onChange: (value: string) => void;
  maxLength?: number;
}

export default function JobDescTextArea({ jdText, onChange, maxLength = 20000 }: Props) {
  const [isFocused, setIsFocused] = useState(false);
  const pct = jdText.length / maxLength;

  return (
    <div
      className="w-full rounded-xl overflow-hidden transition-all duration-150"
      style={{
        border: isFocused ? "2px solid var(--accent)" : "2px solid var(--border-strong)",
        boxShadow: isFocused ? "0 0 0 3px var(--accent-dim)" : "none",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--surface-raised)] border-b border-[var(--border)]">
        <span className="font-mono text-xs font-medium tracking-widest uppercase text-[var(--text-secondary)]">
          Paste JD here
        </span>
        <span
          className="font-mono text-xs tabular-nums"
          style={{ color: pct > 0.9 ? "var(--red)" : "var(--text-dim)" }}
        >
          {jdText.length.toLocaleString()} / {maxLength.toLocaleString()}
        </span>
      </div>

      <textarea
        value={jdText}
        onChange={(e) => onChange(e.target.value.substring(0, maxLength))}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder="Paste the full job description — requirements, responsibilities, qualifications…"
        className="w-full h-[190px] px-4 py-3.5 bg-[var(--surface)] text-sm text-[var(--text-primary)]
          placeholder-[var(--text-dim)] resize-none outline-none custom-scrollbar leading-relaxed"
      />
    </div>
  );
}
