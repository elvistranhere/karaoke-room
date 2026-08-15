"use client";

import { useState, useEffect } from "react";
import { Mic, Volume2 } from "lucide-react";
import type { AudioDevice, MicMode } from "~/hooks/useAudioDevices";
import type { MicCheckState } from "~/hooks/useLiveKit";
import { VOICE_EFFECTS, type VoiceEffect, createEffectChain, type EffectChain } from "~/lib/voiceEffects";
import type { NoiseCancellationMode } from "./Toolbar";

interface SoundProfileModalProps {
  open: boolean;
  onClose: () => void;
  // Mic state
  micMode: MicMode;
  // Voice effect
  voiceEffect: VoiceEffect;
  onVoiceEffectChange: (effect: VoiceEffect) => void;
  effectWetDry: number;
  onEffectWetDry: (wet: number) => void;
  noiseCancellationMode: NoiseCancellationMode;
  onNoiseCancellationModeChange: (mode: NoiseCancellationMode) => void;
  // Devices
  inputDevices: AudioDevice[];
  outputDevices: AudioDevice[];
  selectedInputId: string;
  selectedOutputId: string;
  onInputChange: (id: string) => void;
  onOutputChange: (id: string) => void;
  // Mic check
  onTalkingMicCheck: () => void;
  onSingingMicCheck: () => void;
  onStopMicCheck: () => void;
  micCheckState: MicCheckState;
}

export function SoundProfileModal({
  open,
  onClose,
  micMode,
  voiceEffect,
  onVoiceEffectChange,
  effectWetDry,
  onEffectWetDry,
  noiseCancellationMode,
  onNoiseCancellationModeChange,
  inputDevices,
  outputDevices,
  selectedInputId,
  selectedOutputId,
  onInputChange,
  onOutputChange,
  onTalkingMicCheck,
  onSingingMicCheck,
  onStopMicCheck,
  micCheckState,
}: SoundProfileModalProps) {
  const [micCheckProfile, setMicCheckProfile] = useState<MicMode>(micMode);
  const wetDry = Math.round(effectWetDry * 100);

  // Seed only when the modal opens; re-seeding on state changes would clobber an
  // explicit profile choice the moment a check stops.
  useEffect(() => {
    if (open) setMicCheckProfile(micMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Close modal - auto-stop effect below handles mic check cleanup
  const handleClose = () => {
    onClose();
  };

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose, micCheckState]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-stop mic check when modal closes
  useEffect(() => {
    if (!open && (micCheckState === "monitoring-talk" || micCheckState === "monitoring-sing")) {
      onStopMicCheck();
    }
  }, [open, micCheckState, onStopMicCheck]);

  const handleWetDry = (val: number) => {
    onEffectWetDry(val / 100);
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.6)" }} onClick={handleClose} />

      {/* Modal */}
      <div
        className="fixed left-1/2 top-1/2 z-50 w-[420px] max-w-[95vw] -translate-x-1/2 -translate-y-1/2 rounded-xl border"
        style={{ background: "var(--color-dark-bg)", borderColor: "var(--color-dark-border)", animation: "fade-in 0.15s ease-out" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--color-dark-border)" }}>
          <h2 className="text-sm font-bold uppercase tracking-widest" style={{ fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}>
            Sound Profile
          </h2>
          <button onClick={handleClose} className="cursor-pointer rounded-lg p-1.5 transition-all hover:bg-[var(--color-dark-card)]" style={{ color: "var(--color-text-muted)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="max-h-[70vh] space-y-5 overflow-auto p-5">
          <section>
            <div className="mb-3 flex items-center gap-2">
              <h3 className="text-xs font-medium" style={{ color: "var(--color-text-primary)" }}>
                Noise cancellation
              </h3>
            </div>
            <div className="rounded-lg p-3" style={{ background: "var(--color-dark-surface)" }}>
              <div className="grid grid-cols-3 gap-1 rounded-lg border p-1" style={{ borderColor: "var(--color-dark-border)" }}>
                {(["auto", "on", "off"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => onNoiseCancellationModeChange(mode)}
                    className="cursor-pointer rounded-md px-3 py-2 text-xs font-medium capitalize transition-colors"
                    style={{
                      background: noiseCancellationMode === mode ? "var(--color-primary-dim)" : "transparent",
                      color: noiseCancellationMode === mode ? "#d7bbff" : "var(--color-text-muted)",
                    }}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                {noiseCancellationMode === "auto"
                  ? "Recommended — on while talking and off while singing."
                  : noiseCancellationMode === "on"
                    ? "Enabled for both talking and singing."
                    : "Disabled for both talking and singing."}
              </p>
            </div>
          </section>

          {/* === SINGING MODE === */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <Mic size={16} style={{ color: "var(--color-text-secondary)" }} />
              <h3 className="text-xs font-bold uppercase tracking-widest" style={{ fontFamily: "var(--font-display)", color: "var(--color-text-secondary)" }}>
                Singing Mode
              </h3>
            </div>

            <div className="space-y-3 rounded-lg p-3" style={{ background: "var(--color-dark-surface)" }}>
              {/* Advanced voice effect selector */}
              <div>
                <p className="mb-1 text-xs font-medium" style={{ color: "var(--color-text-primary)" }}>Advanced effects</p>
                <p className="mb-2 text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                  Choose an effect and adjust its intensity. Select it again to turn it off.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {VOICE_EFFECTS.filter((fx) => fx.id !== "none").map((fx) => (
                    <button
                      key={fx.id}
                      type="button"
                      aria-pressed={voiceEffect === fx.id}
                      onClick={() => {
                        if (voiceEffect === fx.id) {
                          onVoiceEffectChange("none");
                          return;
                        }
                        onEffectWetDry(wetDry / 100);
                        onVoiceEffectChange(fx.id);
                      }}
                      className="cursor-pointer rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-all hover:scale-105 active:scale-95"
                      style={{
                        background: voiceEffect === fx.id ? "var(--color-primary)" : "var(--color-dark-card)",
                        color: voiceEffect === fx.id ? "#fff" : "var(--color-text-muted)",
                        borderColor: voiceEffect === fx.id ? "var(--color-primary)" : "var(--color-dark-border)",
                      }}
                      title={voiceEffect === fx.id ? `Disable ${fx.label}` : fx.description}
                    >
                      {fx.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Wet/dry slider */}
              {voiceEffect !== "none" && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase" style={{ color: "var(--color-text-muted)" }}>Dry</span>
                  <input
                    type="range" min="0" max="100" value={wetDry}
                    onChange={(e) => handleWetDry(Number(e.target.value))}
                    className="volume-slider flex-1"
                  />
                  <span className="text-[10px] uppercase" style={{ color: "var(--color-text-muted)" }}>Wet</span>
                  <span className="w-6 text-right text-[10px] tabular-nums" style={{ color: "var(--color-text-muted)" }}>{wetDry}</span>
                </div>
              )}

            </div>
          </section>

          {/* === MIC CHECK === */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <Mic size={16} style={{ color: "var(--color-primary)" }} />
              <h3 className="text-xs font-medium" style={{ color: "var(--color-text-primary)" }}>
                Mic check
              </h3>
            </div>
            <div className="space-y-3 rounded-lg p-3" style={{ background: "var(--color-dark-surface)" }}>
              <div className="grid grid-cols-2 gap-1 rounded-lg border p-1" style={{ borderColor: "var(--color-dark-border)" }}>
                {(["voice", "raw"] as const).map((profile) => (
                  <button
                    key={profile}
                    onClick={() => setMicCheckProfile(profile)}
                    disabled={micCheckState === "monitoring-talk" || micCheckState === "monitoring-sing"}
                    className="cursor-pointer rounded-md px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed"
                    style={{
                      background: micCheckProfile === profile ? "var(--color-primary-dim)" : "transparent",
                      color: micCheckProfile === profile ? "#d7bbff" : "var(--color-text-muted)",
                    }}
                  >
                    {profile === "voice" ? "Talk profile" : "Sing profile"}
                  </button>
                ))}
              </div>
              <button
                onClick={() => {
                  if (micCheckState === "monitoring-talk" || micCheckState === "monitoring-sing") onStopMicCheck();
                  else if (micCheckProfile === "voice") onTalkingMicCheck();
                  else onSingingMicCheck();
                }}
                className="w-full cursor-pointer rounded-lg border py-2.5 text-xs font-medium transition-all hover:brightness-110"
                style={{
                  borderColor: micCheckState.startsWith("monitoring") ? "var(--color-primary)" : "var(--color-dark-border)",
                  background: micCheckState.startsWith("monitoring") ? "var(--color-primary-dim)" : "transparent",
                  color: micCheckState.startsWith("monitoring") ? "#d7bbff" : "var(--color-text-primary)",
                }}
              >
                {micCheckState.startsWith("monitoring") ? "Stop mic check" : micCheckState === "error" ? "Try mic check again" : "Start mic check"}
              </button>
              <p className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                {micCheckState.startsWith("monitoring")
                  ? `Listening to your ${micCheckState === "monitoring-talk" ? "Talk" : "Sing"} profile.`
                  : micCheckProfile === "raw"
                    ? "Includes your selected singing voice effect."
                    : "Uses your talking audio settings."}
              </p>
            </div>
          </section>

          {/* === DEVICES === */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <Volume2 size={16} style={{ color: "var(--color-text-muted)" }} />
              <h3 className="text-xs font-bold uppercase tracking-widest" style={{ fontFamily: "var(--font-display)", color: "var(--color-text-muted)" }}>
                Devices
              </h3>
            </div>

            <div className="space-y-3 rounded-lg p-3" style={{ background: "var(--color-dark-surface)" }}>
              <div>
                <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Microphone</label>
                <select
                  value={selectedInputId}
                  onChange={(e) => onInputChange(e.target.value)}
                  className="w-full cursor-pointer rounded-lg border px-3 py-2 text-sm outline-none transition-all focus:border-[var(--color-primary)]"
                  style={{ background: "var(--color-dark-card)", borderColor: "var(--color-dark-border)", color: "var(--color-text-primary)" }}
                >
                  {inputDevices.length === 0 && <option value="">No devices found</option>}
                  {inputDevices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Speaker</label>
                <select
                  value={selectedOutputId}
                  onChange={(e) => onOutputChange(e.target.value)}
                  className="w-full cursor-pointer rounded-lg border px-3 py-2 text-sm outline-none transition-all focus:border-[var(--color-primary)]"
                  style={{ background: "var(--color-dark-card)", borderColor: "var(--color-dark-border)", color: "var(--color-text-primary)" }}
                >
                  {outputDevices.length === 0 && <option value="">Default</option>}
                  {outputDevices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
                </select>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
