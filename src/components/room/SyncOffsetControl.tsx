"use client";

import { Timer } from "lucide-react";

export const SYNC_OFFSET_STORAGE_KEY = "karaoke-sync-offset-ms";
export const SYNC_AUTO_STORAGE_KEY = "karaoke-sync-offset-auto";
export const SYNC_OFFSET_DEFAULT_MS = 150;
export const SYNC_OFFSET_MAX_MS = 1500;

export function readStoredSyncOffset(): number {
  if (typeof window === "undefined") return SYNC_OFFSET_DEFAULT_MS;
  try {
    const raw = window.localStorage.getItem(SYNC_OFFSET_STORAGE_KEY);
    const value = raw ? Number(raw) : NaN;
    if (!Number.isFinite(value)) return SYNC_OFFSET_DEFAULT_MS;
    return Math.max(0, Math.min(SYNC_OFFSET_MAX_MS, value));
  } catch {
    return SYNC_OFFSET_DEFAULT_MS;
  }
}

export function readStoredSyncAuto(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(SYNC_AUTO_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

interface SyncOffsetControlProps {
  auto: boolean;
  onAutoChange: (auto: boolean) => void;
  autoOffsetMs: number;
  offsetMs: number;
  onOffsetChange: (ms: number) => void;
}

export function SyncOffsetControl({ auto, onAutoChange, autoOffsetMs, offsetMs, onOffsetChange }: SyncOffsetControlProps) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Timer size={15} style={{ color: "var(--color-primary)" }} />
          <span className="text-sm font-medium" style={{ fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}>
            Voice sync
          </span>
        </div>
        <span className="text-xs tabular-nums" style={{ color: "var(--color-text-muted)" }}>
          {auto ? `Auto (${autoOffsetMs} ms)` : `${offsetMs} ms`}
        </span>
      </div>
      <div className="flex gap-1 rounded-lg p-0.5" style={{ background: "var(--color-dark-card)" }}>
        {([true, false] as const).map((mode) => (
          <button
            key={String(mode)}
            onClick={() => onAutoChange(mode)}
            className="flex-1 cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-all"
            style={{
              background: auto === mode ? "var(--color-primary-dim)" : "transparent",
              color: auto === mode ? "var(--color-primary)" : "var(--color-text-muted)",
            }}
          >
            {mode ? "Auto" : "Manual"}
          </button>
        ))}
      </div>
      {!auto && (
        <input
          type="range"
          min="0"
          max={SYNC_OFFSET_MAX_MS}
          step="25"
          value={offsetMs}
          onChange={(event) => onOffsetChange(Number(event.target.value))}
          className="volume-slider mt-3 w-full"
          aria-label="Sync offset in milliseconds"
        />
      )}
      <p className="mt-2 text-[10px]" style={{ color: "var(--color-text-muted)" }}>
        {auto
          ? "Lines the music up with the singer's voice automatically."
          : "Slide right if the music runs ahead of the singer's voice."}
      </p>
    </div>
  );
}
