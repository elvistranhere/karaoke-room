"use client";

import { useState, useEffect } from "react";
import { Mic, Volume2 } from "lucide-react";
import type { AudioDevice, MicMode } from "~/hooks/useAudioDevices";
import type { MicCheckState } from "~/hooks/useLiveKit";
import { VOICE_EFFECTS, type VoiceEffect } from "~/lib/voiceEffects";
import { DIVIDER } from "~/lib/surfaces";
import type { NoiseCancellationMode } from "./Toolbar";
import { Button } from "~/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Slider } from "~/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";

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

const SEGMENT_BASE = "h-10 w-full rounded-md text-xs font-medium";

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
  const monitoring = micCheckState === "monitoring-talk" || micCheckState === "monitoring-sing";

  // Seed only when the modal opens; re-seeding on state changes would clobber an
  // explicit profile choice the moment a check stops.
  useEffect(() => {
    if (open) setMicCheckProfile(micMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Auto-stop mic check when modal closes
  useEffect(() => {
    if (!open && (micCheckState === "monitoring-talk" || micCheckState === "monitoring-sing")) {
      onStopMicCheck();
    }
  }, [open, micCheckState, onStopMicCheck]);

  const handleWetDry = (val: number) => {
    onEffectWetDry(val / 100);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="gap-0 p-0 sm:max-w-[420px]">
        <DialogHeader className="border-b px-5 py-4 pr-14" style={{ borderColor: DIVIDER }}>
          <DialogTitle className="text-sm font-bold uppercase tracking-widest" style={{ fontFamily: "var(--font-display)" }}>
            Sound Profile
          </DialogTitle>
          <DialogDescription className="sr-only">
            Noise cancellation, voice effects, mic check, and audio devices.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-5 overflow-auto p-5">
          <section>
            <div className="mb-3 flex items-center gap-2">
              <h3 className="text-xs font-medium" style={{ color: "var(--color-text-primary)" }}>
                Noise cancellation
              </h3>
            </div>
            <div className="rounded-lg p-3" style={{ background: "var(--color-dark-raised)" }}>
              <div className="grid grid-cols-3 gap-1 rounded-lg p-1" style={{ background: "var(--color-dark-card)" }}>
                {(["auto", "on", "off"] as const).map((mode) => (
                  <Button
                    key={mode}
                    variant="ghost"
                    aria-pressed={noiseCancellationMode === mode}
                    onClick={() => onNoiseCancellationModeChange(mode)}
                    className={`${SEGMENT_BASE} capitalize`}
                    style={{
                      background: noiseCancellationMode === mode ? "var(--color-primary-dim)" : "transparent",
                      color: noiseCancellationMode === mode ? "var(--color-primary-bright)" : "var(--color-text-muted)",
                    }}
                  >
                    {mode}
                  </Button>
                ))}
              </div>
              <p className="mt-2 text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                {noiseCancellationMode === "auto"
                  ? "Recommended - on while talking and off while singing."
                  : noiseCancellationMode === "on"
                    ? "Enabled for both talking and singing."
                    : "Disabled for both talking and singing."}
              </p>
            </div>
          </section>

          {/* === SINGING MODE === */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <Mic size={16} style={{ color: "var(--color-primary)" }} />
              <h3 className="text-xs font-bold uppercase tracking-widest" style={{ fontFamily: "var(--font-display)", color: "var(--color-text-secondary)" }}>
                Singing Mode
              </h3>
            </div>

            <div className="space-y-3 rounded-lg p-3" style={{ background: "var(--color-dark-raised)" }}>
              {/* Advanced voice effect selector */}
              <div>
                <p className="mb-1 text-xs font-medium" style={{ color: "var(--color-text-primary)" }}>Advanced effects</p>
                <p className="mb-2 text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                  Choose an effect and adjust its intensity. Select it again to turn it off.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {VOICE_EFFECTS.filter((fx) => fx.id !== "none").map((fx) => (
                    <Button
                      key={fx.id}
                      size="sm"
                      variant={voiceEffect === fx.id ? "default" : "outline"}
                      aria-pressed={voiceEffect === fx.id}
                      onClick={() => {
                        if (voiceEffect === fx.id) {
                          onVoiceEffectChange("none");
                          return;
                        }
                        onEffectWetDry(wetDry / 100);
                        onVoiceEffectChange(fx.id);
                      }}
                      className="h-10 text-[11px]"
                      title={voiceEffect === fx.id ? `Disable ${fx.label}` : fx.description}
                    >
                      {fx.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Wet/dry slider */}
              {voiceEffect !== "none" && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase" style={{ color: "var(--color-text-muted)" }}>Dry</span>
                  <Slider
                    value={[wetDry]}
                    onValueChange={(next) => handleWetDry(typeof next === "number" ? next : next[0] ?? wetDry)}
                    aria-label="Effect intensity"
                    className="flex-1 [&_[data-slot=slider-control]]:h-10"
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
            <div className="space-y-3 rounded-lg p-3" style={{ background: "var(--color-dark-raised)" }}>
              <div className="grid grid-cols-2 gap-1 rounded-lg p-1" style={{ background: "var(--color-dark-card)" }}>
                {(["voice", "raw"] as const).map((profile) => (
                  <Button
                    key={profile}
                    variant="ghost"
                    aria-pressed={micCheckProfile === profile}
                    onClick={() => setMicCheckProfile(profile)}
                    disabled={monitoring}
                    className={SEGMENT_BASE}
                    style={{
                      background: micCheckProfile === profile ? "var(--color-primary-dim)" : "transparent",
                      color: micCheckProfile === profile ? "var(--color-primary-bright)" : "var(--color-text-muted)",
                    }}
                  >
                    {profile === "voice" ? "Talk profile" : "Sing profile"}
                  </Button>
                ))}
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  if (monitoring) onStopMicCheck();
                  else if (micCheckProfile === "voice") onTalkingMicCheck();
                  else onSingingMicCheck();
                }}
                className="h-10 w-full text-xs"
                style={{
                  borderColor: monitoring ? "var(--color-primary)" : undefined,
                  background: monitoring ? "var(--color-primary-dim)" : undefined,
                  color: monitoring ? "var(--color-primary-bright)" : undefined,
                }}
              >
                {monitoring ? "Stop mic check" : micCheckState === "error" ? "Try mic check again" : "Start mic check"}
              </Button>
              <p className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                {monitoring
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
              <Volume2 size={16} style={{ color: "var(--color-primary)" }} />
              <h3 className="text-xs font-bold uppercase tracking-widest" style={{ fontFamily: "var(--font-display)", color: "var(--color-text-muted)" }}>
                Devices
              </h3>
            </div>

            <div className="space-y-3 rounded-lg p-3" style={{ background: "var(--color-dark-raised)" }}>
              <div>
                <label htmlFor="mic-device" className="mb-1.5 block text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Microphone</label>
                <Select value={selectedInputId} onValueChange={onInputChange}>
                  <SelectTrigger id="mic-device" aria-label="Microphone" className="h-10! w-full cursor-pointer rounded-lg bg-[var(--color-dark-card)] text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {inputDevices.length === 0 ? <SelectItem value="">No devices found</SelectItem> : null}
                    {inputDevices.map((d) => <SelectItem key={d.deviceId} value={d.deviceId}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label htmlFor="speaker-device" className="mb-1.5 block text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Speaker</label>
                <Select value={selectedOutputId} onValueChange={onOutputChange}>
                  <SelectTrigger id="speaker-device" aria-label="Speaker" className="h-10! w-full cursor-pointer rounded-lg bg-[var(--color-dark-card)] text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {outputDevices.length === 0 ? <SelectItem value="">Default</SelectItem> : null}
                    {outputDevices.map((d) => <SelectItem key={d.deviceId} value={d.deviceId}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
