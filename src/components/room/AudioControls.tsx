"use client";

import { useState } from "react";
import type { AudioDevice } from "~/hooks/useAudioDevices";

interface AudioControlsProps {
  isMicEnabled: boolean;
  toggleMic: () => Promise<void>;
  inputDevices: AudioDevice[];
  outputDevices: AudioDevice[];
  selectedInputId: string;
  selectedOutputId: string;
  onInputChange: (id: string) => void;
  onOutputChange: (id: string) => void;
}

export function AudioControls({
  isMicEnabled,
  toggleMic,
  inputDevices,
  outputDevices,
  selectedInputId,
  selectedOutputId,
  onInputChange,
  onOutputChange,
}: AudioControlsProps) {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div
      className="rounded-2xl border p-5"
      style={{
        background: "var(--color-dark-surface)",
        borderColor: "var(--color-dark-border)",
      }}
    >
      <div className="mb-4 flex items-center justify-between">
        <h3
          className="text-sm uppercase tracking-widest"
          style={{
            fontFamily: "var(--font-display)",
            color: "var(--color-neon-cyan)",
            fontSize: "0.75rem",
          }}
        >
          Audio
        </h3>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="cursor-pointer rounded-lg px-3 py-1 text-xs transition-all duration-200 hover:scale-105"
          style={{
            color: "var(--color-text-secondary)",
            background: showSettings
              ? "rgba(0, 240, 255, 0.1)"
              : "var(--color-dark-card)",
          }}
        >
          {showSettings ? "Hide" : "Settings"}
        </button>
      </div>

      {/* Mic toggle */}
      <div className="flex items-center gap-3">
        <button
          onClick={toggleMic}
          className="flex cursor-pointer items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold tracking-wide transition-all duration-200 hover:scale-105 active:scale-95"
          style={{
            fontFamily: "var(--font-display)",
            background: isMicEnabled
              ? "rgba(0, 240, 255, 0.15)"
              : "var(--color-neon-cyan)",
            color: isMicEnabled
              ? "var(--color-neon-cyan)"
              : "var(--color-dark-bg)",
            borderWidth: isMicEnabled ? "1px" : "0",
            borderColor: "var(--color-neon-cyan)",
          }}
        >
          {isMicEnabled ? <MicIcon /> : <MicOffIcon />}
          {isMicEnabled ? "Mute" : "Unmute"}
        </button>
      </div>

      <p
        className="mt-3 text-xs"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {isMicEnabled
          ? "Your mic is on. Others can hear you talking."
          : "Your mic is muted. Click to start talking."}
      </p>

      {/* Settings panel */}
      {showSettings && (
        <div
          className="mt-4 space-y-4 rounded-xl border p-4"
          style={{
            background: "var(--color-dark-card)",
            borderColor: "var(--color-dark-border)",
            animation: "float-up 0.2s ease-out",
          }}
        >
          {/* Mic input selector */}
          <div>
            <label
              className="mb-1.5 block text-xs uppercase tracking-widest"
              style={{
                color: "var(--color-neon-cyan)",
                fontFamily: "var(--font-display)",
                fontSize: "0.65rem",
              }}
            >
              Microphone Input
            </label>
            <select
              value={selectedInputId}
              onChange={(e) => onInputChange(e.target.value)}
              className="w-full cursor-pointer rounded-lg border px-3 py-2 text-sm outline-none transition-all duration-200 focus:border-[var(--color-neon-cyan)]"
              style={{
                background: "var(--color-dark-bg)",
                borderColor: "var(--color-dark-border)",
                color: "var(--color-text-primary)",
              }}
            >
              {inputDevices.length === 0 && (
                <option value="">No devices found</option>
              )}
              {inputDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          {/* Audio output selector */}
          <div>
            <label
              className="mb-1.5 block text-xs uppercase tracking-widest"
              style={{
                color: "var(--color-neon-purple)",
                fontFamily: "var(--font-display)",
                fontSize: "0.65rem",
              }}
            >
              Audio Output
            </label>
            <select
              value={selectedOutputId}
              onChange={(e) => onOutputChange(e.target.value)}
              className="w-full cursor-pointer rounded-lg border px-3 py-2 text-sm outline-none transition-all duration-200 focus:border-[var(--color-neon-purple)]"
              style={{
                background: "var(--color-dark-bg)",
                borderColor: "var(--color-dark-border)",
                color: "var(--color-text-primary)",
              }}
            >
              {outputDevices.length === 0 && (
                <option value="">Default</option>
              )}
              {outputDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          <p
            className="text-xs"
            style={{ color: "var(--color-text-secondary)", opacity: 0.7 }}
          >
            Audio is streamed in high-quality stereo (48kHz Opus).
          </p>
        </div>
      )}
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="2" x2="22" y1="2" y2="22" />
      <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
      <path d="M5 10v2a7 7 0 0 0 12 5" />
      <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}
