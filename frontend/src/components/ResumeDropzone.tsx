"use client";
import { useState, useCallback } from "react";

interface Props {
  onFileSelect: (file: File) => void;
}

export default function ResumeDropzone({ onFileSelect }: Props) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const accept = (file: File) => {
    if (file.type !== "application/pdf") {
      alert("Please upload a PDF file.");
      return;
    }
    setSelectedFile(file);
    onFileSelect(file);
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) accept(file);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onFileSelect]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) accept(file);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      className={`relative w-full h-36 rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all duration-150
        ${isDragOver
          ? "border-2 border-[var(--accent)] bg-[var(--accent-dim)]"
          : selectedFile
          ? "border-2 border-[var(--accent)] bg-[var(--accent-dim)]"
          : "border-2 border-dashed border-[var(--border-strong)] bg-[var(--surface-raised)] hover:border-[var(--accent)] hover:bg-[var(--accent-dim)]"
        }`}
    >
      <input
        type="file"
        accept="application/pdf"
        onChange={handleChange}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
      />

      {selectedFile ? (
        <div className="text-center px-6 pointer-events-none">
          <div className="w-9 h-9 mx-auto mb-2.5 flex items-center justify-center rounded-full bg-[var(--accent)]">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="font-semibold text-sm text-[var(--text-primary)] truncate max-w-[260px]">
            {selectedFile.name}
          </p>
          <p className="mt-0.5 font-mono text-xs text-[var(--text-dim)]">
            {(selectedFile.size / 1024 / 1024).toFixed(2)} MB · click to replace
          </p>
        </div>
      ) : (
        <div className="text-center px-6 pointer-events-none">
          <div className="w-10 h-10 mx-auto mb-2.5 flex items-center justify-center rounded-full bg-[var(--surface)]"
            style={{ boxShadow: "var(--shadow-md)" }}>
            <svg className="w-5 h-5 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          </div>
          <p className="font-medium text-sm text-[var(--text-primary)]">
            {isDragOver ? "Drop your PDF here" : "Drop PDF or click to browse"}
          </p>
          <p className="mt-0.5 font-mono text-xs text-[var(--text-dim)]">
            PDF only · max 10 MB
          </p>
        </div>
      )}
    </div>
  );
}
