"use client";

import { Timer } from "lucide-react";
import { Slider } from "~/components/ui/slider";

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

export const SYNC_OFFSET_BY_SINGER_KEY = "karaoke-sync-offset-by-singer";
const MAX_SINGER_OFFSET_ENTRIES = 50;

function readSingerOffsetMap(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SYNC_OFFSET_BY_SINGER_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export function readStoredSyncOffsetFor(singerName: string | null): number {
  if (singerName) {
    const value = readSingerOffsetMap()[singerName];
    if (Number.isFinite(value)) {
      return Math.max(0, Math.min(SYNC_OFFSET_MAX_MS, value as number));
    }
  }
  return readStoredSyncOffset();
}

export function storeSyncOffsetFor(singerName: string | null, ms: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SYNC_OFFSET_STORAGE_KEY, String(ms));
    if (!singerName) return;
    const map = readSingerOffsetMap();
    map[singerName] = ms;
    const names = Object.keys(map);
    if (names.length > MAX_SINGER_OFFSET_ENTRIES) {
      for (const name of names.slice(0, names.length - MAX_SINGER_OFFSET_ENTRIES)) {
        delete map[name];
      }
    }
    window.localStorage.setItem(SYNC_OFFSET_BY_SINGER_KEY, JSON.stringify(map));
  } catch {
    // storage unavailable, the offset still applies for this session
  }
}

interface SyncOffsetControlProps {
  auto: boolean;
  onAutoChange: (auto: boolean) => void;
  autoOffsetMs: number;
  offsetMs: number;
  onOffsetChange: (ms: number) => void;
  singerName?: string | null;
}

export function SyncOffsetControl({ auto, onAutoChange, autoOffsetMs, offsetMs, onOffsetChange, singerName }: SyncOffsetControlProps) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Timer size={15} style={{ color: "var(--color-primary)" }} />
          <span className="text-sm font-medium" style={{ fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}>
            Voice sync{singerName ? ` for ${singerName}` : ""}
          </span>
          <span
            className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
            style={{ background: "var(--color-accent-dim, rgba(245, 158, 11, 0.15))", color: "var(--color-accent)" }}
          >
            Experimental
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
        <Slider
          max={SYNC_OFFSET_MAX_MS}
          step={25}
          value={[offsetMs]}
          onValueChange={(next) => onOffsetChange(typeof next === "number" ? next : next[0] ?? offsetMs)}
          aria-label="Sync offset in milliseconds"
          className="mt-3 [&_[data-slot=slider-control]]:h-10"
        />
      )}
      <p className="mt-2 text-[10px]" style={{ color: "var(--color-text-muted)" }}>
        {auto
          ? "Lines the music up with this singer's voice automatically."
          : "Slide right if the music runs ahead. Remembered per singer."}
      </p>
    </div>
  );
}
