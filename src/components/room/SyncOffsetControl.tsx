"use client";

import { Timer } from "lucide-react";

export const SYNC_OFFSET_STORAGE_KEY = "karaoke-sync-offset-ms";
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

interface SyncOffsetControlProps {
  offsetMs: number;
  onOffsetChange: (ms: number) => void;
}

export function SyncOffsetControl({ offsetMs, onOffsetChange }: SyncOffsetControlProps) {
  return (
    <div className="mt-2 rounded-xl p-3.5" style={{ background: "var(--color-dark-card)" }}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-white">Sync offset</span>
        <span className="text-xs tabular-nums" style={{ color: "var(--color-text-muted)" }}>{offsetMs} ms</span>
      </div>
      <div className="flex items-center gap-2">
        <Timer size={14} style={{ color: "var(--color-primary)" }} />
        <input
          type="range"
          min="0"
          max={SYNC_OFFSET_MAX_MS}
          step="25"
          value={offsetMs}
          onChange={(event) => onOffsetChange(Number(event.target.value))}
          className="volume-slider flex-1"
          aria-label="Sync offset in milliseconds"
        />
      </div>
      <p className="mt-2 text-[10px]" style={{ color: "var(--color-text-muted)" }}>
        Slide right if the music runs ahead of the singer&apos;s voice.
      </p>
    </div>
  );
}
