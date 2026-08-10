"use client";

import { useState } from "react";

interface JoinQueueModalProps {
  open: boolean;
  onClose: () => void;
  onJoin: () => void;
  onSetSongIntent?: (song: string) => void;
}

export function JoinQueueModal({ open, onClose, onJoin, onSetSongIntent }: JoinQueueModalProps) {
  const [songIntent, setSongIntent] = useState("");

  if (!open) return null;

  const submit = () => {
    if (songIntent.trim()) onSetSongIntent?.(songIntent.trim());
    onJoin();
    setSongIntent("");
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose} />
      <div
        className="fixed left-1/2 top-1/2 z-50 w-80 -translate-x-1/2 -translate-y-1/2 rounded-2xl border p-5"
        style={{ background: "var(--color-dark-surface)", borderColor: "var(--color-dark-border)", animation: "fade-in 0.15s ease-out" }}
      >
        <h3 className="mb-1 text-sm font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}>
          What will you sing?
        </h3>
        <p className="mb-4 text-xs" style={{ color: "var(--color-text-muted)" }}>
          Add a song name now, or leave it blank if you&apos;re not sure yet.
        </p>
        <input
          autoFocus
          type="text"
          value={songIntent}
          onChange={(event) => setSongIntent(event.target.value.slice(0, 60))}
          onKeyDown={(event) => { if (event.key === "Enter") submit(); }}
          placeholder="Song name (optional)"
          className="mb-3 w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-all focus:border-[var(--color-primary)]"
          style={{ background: "var(--color-dark-card)", borderColor: "var(--color-dark-border)", color: "var(--color-text-primary)" }}
        />
        <div>
          <button onClick={submit} className="w-full cursor-pointer rounded-lg py-2.5 text-xs font-bold transition-all hover:brightness-110" style={{ background: "var(--color-primary)", color: "#fff" }}>
            Join queue
          </button>
        </div>
      </div>
    </>
  );
}
