"use client";

import { useState } from "react";
import { Link2 } from "lucide-react";
import { parseYouTubeId } from "~/lib/youtube";

interface VideoUrlInputProps {
  onLoad: (videoId: string) => void;
  label?: string;
  autoFocus?: boolean;
}

export function VideoUrlInput({ onLoad, label = "Load video", autoFocus = false }: VideoUrlInputProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const videoId = parseYouTubeId(value);
    if (!videoId) {
      setError("That does not look like a YouTube link");
      return;
    }
    setError(null);
    setValue("");
    onLoad(videoId);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg" style={{ background: "var(--color-dark-card)", color: "var(--color-primary)" }}>
          <Link2 size={15} />
        </span>
        <input
          autoFocus={autoFocus}
          type="url"
          inputMode="url"
          value={value}
          onChange={(event) => { setValue(event.target.value); if (error) setError(null); }}
          onKeyDown={(event) => { if (event.key === "Enter") submit(); }}
          placeholder="Paste a YouTube link"
          className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-xs outline-none transition-all focus:border-[var(--color-primary)]"
          style={{ background: "var(--color-dark-card)", borderColor: "var(--color-dark-border)", color: "var(--color-text-primary)" }}
          aria-label="YouTube link"
        />
        <button
          onClick={submit}
          disabled={!value.trim()}
          className="shrink-0 cursor-pointer rounded-lg px-3 py-2 text-xs font-bold transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          style={{ fontFamily: "var(--font-display)", background: "var(--color-primary)", color: "#fff" }}
        >
          {label}
        </button>
      </div>
      {error && (
        <p className="text-[11px]" style={{ color: "var(--color-danger)" }}>{error}</p>
      )}
    </div>
  );
}
