"use client";

import { useState } from "react";
import { parseYouTubeId } from "~/lib/youtube";

interface JoinQueueModalProps {
  open: boolean;
  onClose: () => void;
  onJoin: () => void;
  onSetSongIntent?: (song: string) => void;
  onSetPendingVideo?: (videoId: string | null) => void;
}

export function JoinQueueModal({ open, onClose, onJoin, onSetSongIntent, onSetPendingVideo }: JoinQueueModalProps) {
  const [songIntent, setSongIntent] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const submit = () => {
    const trimmedUrl = videoUrl.trim();
    const videoId = trimmedUrl ? parseYouTubeId(trimmedUrl) : null;
    if (trimmedUrl && !videoId) {
      setError("That does not look like a YouTube link");
      return;
    }
    if (songIntent.trim()) onSetSongIntent?.(songIntent.trim());
    onSetPendingVideo?.(videoId);
    onJoin();
    setSongIntent("");
    setVideoUrl("");
    setError(null);
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
          Add a song name and a YouTube link now, or leave them blank and set them on stage.
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
        <input
          type="url"
          inputMode="url"
          value={videoUrl}
          onChange={(event) => { setVideoUrl(event.target.value); if (error) setError(null); }}
          onKeyDown={(event) => { if (event.key === "Enter") submit(); }}
          placeholder="YouTube link (optional)"
          className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-all focus:border-[var(--color-primary)]"
          style={{ background: "var(--color-dark-card)", borderColor: "var(--color-dark-border)", color: "var(--color-text-primary)" }}
          aria-label="YouTube link"
        />
        {error && <p className="mt-2 text-[11px]" style={{ color: "var(--color-danger)" }}>{error}</p>}
        <div className="mt-3">
          <button onClick={submit} className="w-full cursor-pointer rounded-lg py-2.5 text-xs font-bold transition-all hover:brightness-110" style={{ background: "var(--color-primary)", color: "#fff" }}>
            Join queue
          </button>
        </div>
      </div>
    </>
  );
}
