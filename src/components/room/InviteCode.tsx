"use client";

import { useState } from "react";
import { Check, Copy, LockKeyhole } from "lucide-react";

function copyToClipboard(text: string): boolean {
  // Try modern API first
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => {});
    return true;
  }

  // Fallback: textarea + execCommand
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand("copy");
    return true;
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

export function InviteCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const url = `${window.location.origin}/room/${code}`;
    const ok = copyToClipboard(url);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-all duration-200 hover:bg-[var(--color-dark-card)] active:scale-[0.98]"
      style={{
        color: copied ? "var(--color-neon-cyan)" : "var(--color-text-primary)",
      }}
      title="Click to copy invite link"
    >
      <LockKeyhole size={14} style={{ color: "var(--color-text-muted)" }} />
      <span className="hidden sm:inline" style={{ color: "var(--color-text-secondary)" }}>Room:</span>
      <span className="font-mono tracking-[0.08em]">{code}</span>
      {copied
        ? <Check size={13} style={{ color: "var(--color-neon-cyan)" }} />
        : <Copy size={12} style={{ color: "var(--color-text-muted)" }} />}
    </button>
  );
}
