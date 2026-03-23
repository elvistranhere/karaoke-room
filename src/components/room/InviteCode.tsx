"use client";

import { useState } from "react";

export function InviteCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/room/${code}`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: copy just the code
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 font-mono text-sm tracking-[0.2em] transition-all duration-200 hover:scale-105 active:scale-95"
      style={{
        borderColor: copied
          ? "var(--color-neon-cyan)"
          : "var(--color-dark-border)",
        color: copied ? "var(--color-neon-cyan)" : "var(--color-text-primary)",
        background: "var(--color-dark-card)",
      }}
      title="Click to copy invite link"
    >
      <span>{code}</span>
      <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
        {copied ? "Copied!" : "Copy"}
      </span>
    </button>
  );
}
