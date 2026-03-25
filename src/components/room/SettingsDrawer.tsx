"use client";

import { useEffect } from "react";

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  voiceVolume: number;
  onVoiceVolumeChange: (vol: number) => void;
}

export function SettingsDrawer({
  open,
  onClose,
  voiceVolume,
  onVoiceVolumeChange,
}: SettingsDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: "rgba(0,0,0,0.5)" }}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="fixed right-0 top-0 z-50 flex h-full w-80 flex-col border-l"
        style={{
          background: "var(--color-dark-bg)",
          borderColor: "var(--color-dark-border)",
          animation: "slide-in-right 0.2s ease-out",
        }}
      >
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--color-dark-border)" }}>
          <h2
            className="text-sm font-semibold uppercase tracking-widest"
            style={{ fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}
          >
            Settings
          </h2>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1.5 text-sm transition-all hover:bg-[var(--color-dark-card)]"
            style={{ color: "var(--color-text-muted)" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-auto p-5">
          {/* App Volume */}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-widest" style={{ fontFamily: "var(--font-display)", color: "var(--color-text-muted)" }}>
              App Volume
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range" min="0" max="100"
                value={Math.round(voiceVolume * 100)}
                onChange={(e) => onVoiceVolumeChange(Number(e.target.value) / 100)}
                className="volume-slider flex-1"
              />
              <span className="w-8 text-right text-xs tabular-nums" style={{ color: "var(--color-text-muted)" }}>
                {Math.round(voiceVolume * 100)}
              </span>
            </div>
            <p className="mt-1 text-[10px]" style={{ color: "var(--color-text-muted)" }}>
              Controls overall volume of all incoming audio
            </p>
          </div>

          <div className="rounded-lg p-4 text-center" style={{ background: "var(--color-dark-surface)" }}>
            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              Mic settings, voice effects, and device selection are in
            </p>
            <p className="mt-1 text-xs font-bold" style={{ color: "var(--color-primary)" }}>
              Sound Profile
            </p>
            <p className="mt-0.5 text-[10px]" style={{ color: "var(--color-text-muted)" }}>
              (click the Talk/Sing button in the toolbar)
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

