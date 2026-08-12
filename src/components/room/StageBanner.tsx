"use client";

import { useState, useEffect, useRef } from "react";
import type { Room } from "livekit-client";
import type { RoomState } from "~/types/room";
import { Mic, Music, VolumeX, Volume1, Volume2, Circle, Square, Wand2, SlidersHorizontal, ChevronDown, Plus } from "lucide-react";
import type { RecordingState } from "~/hooks/useLiveKit";
import { AudioVisualizer } from "./AudioVisualizer";

interface StageBannerProps {
  room: Room | null;
  roomState: RoomState;
  isMyTurn: boolean;
  isSharing: boolean;
  onStartSharing: () => Promise<void>;
  onStopSharing: () => void;
  onFinishSinging: () => void;
  audioError: string | null;
  singerSongName: string | null;
  canSing: boolean;
  onAddToQueue?: () => void;
  musicVolume?: number;
  onMusicVolumeChange?: (vol: number) => void;
  onMixMicGain?: (val: number) => void;
  onMixMusicGain?: (val: number) => void;
  ambientId?: string;
  ambientColor?: "violet" | "amber";
  onMuteAll?: () => void;
  onUnmuteAll?: () => void;
  isMutedAll?: boolean;
  // Auto-mix
  autoMix?: boolean;
  onAutoMixChange?: (on: boolean) => void;
  // Collaborative mix (listener can adjust singer's mix)
  onMixAdjust?: (voice: number, music: number) => void;
  onMixAdjustDone?: (voice: number, music: number) => void;
  singerAutoMix?: boolean;
  mixVoiceValue?: number;
  mixMusicValue?: number;
  // Recording
  recordingState?: RecordingState;
  recordingDuration?: number;
  onStartRecording?: () => void;
  onStopRecording?: () => void;
}

export function StageBanner({
  room,
  roomState,
  isMyTurn,
  isSharing,
  onStartSharing,
  onStopSharing,
  onFinishSinging,
  audioError,
  singerSongName,
  canSing,
  onAddToQueue,
  musicVolume = 1,
  onMusicVolumeChange,
  onMixMicGain,
  onMixMusicGain,
  ambientId,
  ambientColor,
  onMuteAll,
  onUnmuteAll,
  isMutedAll = false,
  onMixAdjust,
  onMixAdjustDone,
  singerAutoMix = false,
  mixVoiceValue = 100,
  mixMusicValue = 70,
  autoMix = false,
  onAutoMixChange,
  recordingState = "idle",
  recordingDuration = 0,
  onStartRecording,
  onStopRecording,
}: StageBannerProps) {
  const [liveRoomLevel, setLiveRoomLevel] = useState(0);
  const currentSinger = roomState.participants.find(
    (p) => p.id === roomState.currentSingerId,
  );

  const isSomeoneSinging = !!roomState.currentSingerId;
  const roomVolumePercent = Math.round(musicVolume * 100);
  const RoomVolumeIcon = roomVolumePercent === 0 ? VolumeX : roomVolumePercent < 50 ? Volume1 : Volume2;
  const meterBars = [0.35, 0.55, 0.78, 1, 0.78, 0.55, 0.35];

  useEffect(() => {
    if (!room || !isSomeoneSinging || isMyTurn || roomVolumePercent === 0) {
      setLiveRoomLevel(0);
      return;
    }

    const updateLevel = () => {
      const remoteLevel = Math.max(0, ...Array.from(room.remoteParticipants.values(), (participant) => participant.audioLevel || 0));
      setLiveRoomLevel((previous) => previous * 0.55 + Math.min(1, remoteLevel) * 0.45);
    };
    updateLevel();
    const interval = window.setInterval(updateLevel, 75);
    return () => window.clearInterval(interval);
  }, [room, isSomeoneSinging, isMyTurn, roomVolumePercent]);

  // No one singing — compact idle state
  if (!isSomeoneSinging) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-8 text-center">
        <div
          className="mb-4 flex size-16 items-center justify-center rounded-full border"
          style={{
            background: "var(--color-primary-dim)",
            borderColor: "color-mix(in srgb, var(--color-primary) 30%, var(--color-dark-border))",
            color: "#c9a7ff",
          }}
        >
          <Music size={24} />
        </div>
        <h2 className="text-xl font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
          The stage is ready
        </h2>
        <p className="mt-2 max-w-sm text-sm leading-6" style={{ color: "var(--color-text-muted)" }}>
          Add a song to the queue when you&apos;re ready to sing.
        </p>
        {onAddToQueue && (
          <button
            onClick={onAddToQueue}
            className="mt-5 flex cursor-pointer items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-all hover:brightness-110 active:scale-[0.98]"
            style={{ background: "linear-gradient(135deg, #9d5cff 0%, #7c3aed 100%)", color: "#fff", boxShadow: "0 0 20px rgba(157, 92, 255, 0.25)" }}
          >
            <Plus size={16} />
            Add to queue
          </button>
        )}
        <div className="mt-5 flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs" style={{ borderColor: "var(--color-dark-border)", color: "var(--color-text-secondary)" }}>
          <Mic size={13} />
          Nobody is singing right now
        </div>
      </div>
    );
  }

  // Someone else singing — informational banner with volume
  if (!isMyTurn) {
    return (
      <AudioVisualizer room={room} isActive={isSomeoneSinging} ambientId={ambientId} ambientColor={ambientColor} className="h-full w-full">
      <div
        className="relative flex h-full flex-col justify-center overflow-hidden rounded-2xl p-5 sm:p-8"
        style={{ background: "var(--color-dark-surface)" }}
      >
        <div className="absolute left-0 top-0 h-0.5 w-full" style={{ background: "linear-gradient(90deg, var(--color-primary), var(--color-tertiary, #ff5c9d))" }} />
        <div className="flex items-center gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--color-primary-dim)", color: "#c9a7ff" }}>
            <Mic size={23} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center">
              <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider" style={{ background: "color-mix(in srgb, var(--color-success) 12%, transparent)", color: "var(--color-success)" }}>Live performance</span>
            </div>
            <h2 className="truncate text-xl font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
              {currentSinger?.name ?? "Unknown"} is singing
            </h2>
            <p className="mt-0.5 truncate text-sm" style={{ color: singerSongName ? "#c9a7ff" : "var(--color-text-muted)" }}>
              {singerSongName || "Song unknown"}
            </p>
          </div>
          <div
            className="hidden h-10 shrink-0 items-center gap-1 sm:flex"
            role="meter"
            aria-label="Live room audio level"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(liveRoomLevel * roomVolumePercent)}
            title={roomVolumePercent === 0 ? "Room audio muted" : `Room audio level ${Math.round(liveRoomLevel * 100)}%`}
          >
            {meterBars.map((shape, index) => (
              <span
                key={`${shape}-${index}`}
                className="w-0.5 rounded-full"
                style={{
                  height: `${Math.max(5, Math.min(38, 5 + liveRoomLevel * 40 * shape))}px`,
                  background: roomVolumePercent === 0 ? "var(--color-text-muted)" : "#b78cff",
                  opacity: roomVolumePercent === 0 ? 0.25 : 0.55 + liveRoomLevel * 0.45,
                  transition: "height 90ms ease-out, opacity 120ms ease-out",
                }}
              />
            ))}
          </div>
        </div>

        {/* Local volume control */}
        {onMusicVolumeChange && (
          <div className="mt-5 rounded-xl p-3.5" style={{ background: "var(--color-dark-card)" }}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-white">Room volume</span>
              <span className="text-xs tabular-nums" style={{ color: "var(--color-text-muted)" }}>{roomVolumePercent}%</span>
            </div>
            <div className="flex items-center gap-2">
              <RoomVolumeIcon size={14} style={{ color: roomVolumePercent === 0 ? "var(--color-text-muted)" : "var(--color-primary)" }} />
              <input type="range" min="0" max="100" value={roomVolumePercent} onChange={(e) => onMusicVolumeChange(Number(e.target.value) / 100)} className="volume-slider flex-1" aria-label="Room volume" />
            </div>
          </div>
        )}
        {/* Collaborative mix — adjust singer's voice/music balance for everyone */}
        {onMixAdjust && !singerAutoMix && (
          <ListenerMixControl voiceValue={mixVoiceValue} musicValue={mixMusicValue} onAdjust={onMixAdjust} onDone={onMixAdjustDone} />
        )}
        {singerAutoMix && (
          <p className="mt-2 text-center text-[10px]" style={{ color: "var(--color-primary)" }}>
            Auto Mix is active — music adjusts automatically
          </p>
        )}

      </div>
      </AudioVisualizer>
    );
  }

  // My turn — expanded with controls
  return (
    <AudioVisualizer room={room} isActive={isSharing} ambientId={ambientId} ambientColor={ambientColor} framed={isSharing} className="h-full w-full">
    <div
      className={`relative flex h-full flex-col overflow-hidden rounded-2xl border ${isSharing ? "p-4" : "justify-center p-6 sm:p-8"}`}
      style={{ background: "var(--color-dark-surface)", borderColor: "var(--color-dark-border)" }}
    >
      <div
        className="absolute left-0 top-0 h-0.5 w-full"
        style={{ background: "linear-gradient(90deg, var(--color-primary), var(--color-accent))" }}
      />

      {audioError && (
        <div className="mb-3 rounded-lg px-3 py-2 text-xs" style={{ background: "var(--color-danger-dim)", color: "var(--color-danger)" }}>
          {audioError}
        </div>
      )}

      {!isSharing ? (
        <div className="mx-auto w-full max-w-lg text-center">
          <div
            className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full border"
            style={{ background: "var(--color-primary-dim)", borderColor: "color-mix(in srgb, var(--color-primary) 40%, var(--color-dark-border))", color: "#c9a7ff" }}
          >
            <Mic size={26} />
          </div>
          <span className="rounded-full px-2.5 py-1 text-[10px] font-semibold" style={{ background: "var(--color-primary-dim)", color: "#d7bbff" }}>
            You&apos;re up
          </span>
          <h2 className="mt-3 text-xl font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
            Your turn to sing
          </h2>
          {singerSongName && <p className="mt-1 text-sm" style={{ color: "#c9a7ff" }}>{singerSongName}</p>}
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6" style={{ color: "var(--color-text-muted)" }}>
            Open your karaoke song in another tab, then share that tab&apos;s audio with the room.
          </p>

          {canSing ? (
            <div className="mt-6 space-y-2">
              <button
                onClick={onStartSharing}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
                style={{ fontFamily: "var(--font-display)", background: "linear-gradient(135deg, #9d5cff 0%, #7c3aed 100%)", color: "#fff", boxShadow: "0 0 20px rgba(157, 92, 255, 0.25)" }}
              >
                <Music size={16} />
                Share tab audio
              </button>
              <button
                onClick={onFinishSinging}
                className="w-full cursor-pointer rounded-lg px-4 py-2 text-xs transition-colors hover:bg-white/5"
                style={{ color: "var(--color-text-muted)" }}
              >
                Leave stage
              </button>
            </div>
          ) : (
            <p className="mt-6 rounded-lg py-3 text-center text-xs" style={{ color: "var(--color-text-muted)", background: "var(--color-dark-card)" }}>
              Singing requires a Chromium browser (Chrome, Edge, Brave, Arc...)
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Mic size={20} style={{ color: "var(--color-primary)" }} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}>
                Sharing Audio
              </p>
              {singerSongName && (
                <p className="truncate text-xs" style={{ color: "var(--color-primary)" }}>
                  {singerSongName}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-success)", animation: "fade-in 1.5s ease-in-out infinite alternate" }} />
              <span className="text-xs" style={{ color: "var(--color-success)" }}>Live</span>
            </div>
          </div>

          {/* Song name — always editable */}
          <SongNameInput
            initial={singerSongName ?? ""}
            onSet={(name) => {
              window.dispatchEvent(new CustomEvent("karaoke-set-song", { detail: name }));
            }}
          />

          {/* Separate mic/music volume sliders + auto-mix */}
          {onMixMicGain && onMixMusicGain && (
            <div className="space-y-2">
              <MixSlider label="Voice" icon={<Mic size={14} style={{ color: "var(--color-primary)" }} />} value={mixVoiceValue} onChange={(v) => onMixMicGain(v / 100)} disabled={autoMix} />
              <MixSlider label="Music" icon={<Music size={14} style={{ color: "var(--color-accent)" }} />} value={mixMusicValue} onChange={(v) => onMixMusicGain(v / 100)} disabled={autoMix} />
              {onAutoMixChange && (
                <button
                  onClick={() => onAutoMixChange(!autoMix)}
                  className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border py-1.5 text-[10px] font-medium transition-all hover:brightness-110"
                  style={{
                    borderColor: autoMix ? "var(--color-primary)" : "var(--color-dark-border)",
                    background: autoMix ? "var(--color-primary-dim)" : "transparent",
                    color: autoMix ? "var(--color-primary)" : "var(--color-text-muted)",
                  }}
                  title="Automatically lowers music and boosts your voice when you sing. Turn off to adjust sliders manually."
                >
                  <Wand2 size={10} />
                  {autoMix ? "Disable Auto Mix" : "Enable Auto Mix"}
                </button>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {/* Record button */}
            {onStartRecording && onStopRecording && (
              <button
                onClick={recordingState === "recording" ? onStopRecording : onStartRecording}
                className="flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all hover:brightness-110"
                style={{
                  borderColor: recordingState === "recording" ? "var(--color-danger)" : "var(--color-dark-border)",
                  background: recordingState === "recording" ? "rgba(239, 68, 68, 0.1)" : "transparent",
                  color: recordingState === "recording" ? "var(--color-danger)" : "var(--color-text-muted)",
                }}
                title={recordingState === "recording" ? "Stop recording" : "Record your performance"}
              >
                {recordingState === "recording" ? (
                  <>
                    <Square size={10} fill="currentColor" />
                    {formatDuration(recordingDuration)}
                  </>
                ) : (
                  <>
                    <Circle size={10} fill="currentColor" style={{ color: "var(--color-danger)" }} />
                    Record
                  </>
                )}
              </button>
            )}
            {onMuteAll && onUnmuteAll && (
              <button
                onClick={isMutedAll ? onUnmuteAll : onMuteAll}
                className="flex cursor-pointer items-center gap-1 rounded-lg border px-3 py-2 text-xs font-medium transition-all hover:brightness-110"
                style={{
                  borderColor: isMutedAll ? "var(--color-accent)" : "var(--color-dark-border)",
                  background: isMutedAll ? "var(--color-accent-dim)" : "transparent",
                  color: isMutedAll ? "var(--color-accent)" : "var(--color-text-muted)",
                }}
                title={isMutedAll ? "Unmute everyone" : "Mute all other microphones"}
              >
                {isMutedAll ? <VolumeX size={12} /> : <Volume2 size={12} />}
                {isMutedAll ? "Unmute All" : "Mute All"}
              </button>
            )}
            <button
              onClick={onStopSharing}
              className="flex-1 cursor-pointer rounded-lg border py-2 text-xs font-medium transition-all hover:brightness-110"
              style={{ borderColor: "var(--color-dark-border)", color: "var(--color-text-muted)" }}
            >
              Stop Music
            </button>
            <button
              onClick={() => { onStopSharing(); onFinishSinging(); }}
              className="flex-1 cursor-pointer rounded-lg py-2 text-xs font-medium transition-all hover:brightness-110"
              style={{ background: "var(--color-danger-dim)", color: "var(--color-danger)" }}
            >
              Finish Turn
            </button>
          </div>
        </div>
      )}

    </div>
    </AudioVisualizer>
  );
}

function formatDuration(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function MixSlider({ label, icon, value, onChange, disabled }: { label: string; icon: React.ReactNode; value: number; onChange: (val: number) => void; disabled?: boolean }) {
  const fill = Math.min(100, (value / 150) * 100);
  return (
    <div className="flex items-center gap-3" style={disabled ? { opacity: 0.6, pointerEvents: "none" } : undefined}>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg" style={{ background: "var(--color-dark-card)" }}>{icon}</span>
      <span className="w-11 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-secondary)" }}>{disabled ? "auto" : label}</span>
      <input
        type="range"
        min="0"
        max="150"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="volume-slider flex-1"
        style={{ background: `linear-gradient(to right, var(--color-primary) 0%, var(--color-primary) ${fill}%, var(--color-dark-border) ${fill}%, var(--color-dark-border) 100%)` }}
        disabled={disabled}
      />
      <span className="w-7 text-right text-[11px] tabular-nums" style={{ color: "var(--color-text-secondary)" }}>{value}</span>
    </div>
  );
}

function SongNameInput({ initial, onSet }: { initial: string; onSet: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial);

  // Sync if external value changes
  useEffect(() => { setValue(initial); }, [initial]);

  const submit = () => {
    if (value.trim()) onSet(value.trim());
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-left text-xs transition-all hover:bg-[var(--color-dark-card)]"
        style={{ color: value ? "var(--color-accent)" : "var(--color-text-muted)" }}
      >
        <span className="truncate flex-1">{value || "What are you singing? (click to set)"}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5, flexShrink: 0 }}>
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
        </svg>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        autoFocus
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value.slice(0, 60))}
        placeholder="Song name..."
        className="flex-1 rounded-lg border px-3 py-1.5 text-xs outline-none transition-all focus:border-[var(--color-primary)]"
        style={{ background: "var(--color-dark-card)", borderColor: "var(--color-dark-border)", color: "var(--color-text-primary)" }}
        onBlur={submit}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") { setValue(initial); setEditing(false); } }}
      />
    </div>
  );
}

function ListenerMixControl({ voiceValue, musicValue, onAdjust, onDone }: { voiceValue: number; musicValue: number; onAdjust: (voice: number, music: number) => void; onDone?: (voice: number, music: number) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [voice, setVoice] = useState(voiceValue);
  const [music, setMusic] = useState(musicValue);
  const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync from external changes (e.g., singer adjusted)
  useEffect(() => { setVoice(voiceValue); }, [voiceValue]);
  useEffect(() => { setMusic(musicValue); }, [musicValue]);

  // Cleanup throttle on unmount
  useEffect(() => () => { if (throttleRef.current) clearTimeout(throttleRef.current); }, []);

  const sendThrottled = (v: number, m: number) => {
    if (throttleRef.current) clearTimeout(throttleRef.current);
    throttleRef.current = setTimeout(() => { onAdjust(v / 100, m / 100); }, 100);
  };

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="mt-3 flex w-full cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-all hover:border-[color-mix(in_srgb,var(--color-primary)_45%,var(--color-dark-border))] hover:bg-[var(--color-primary-dim)] active:scale-[0.995]"
        style={{ background: "color-mix(in srgb, var(--color-dark-card) 55%, transparent)", borderColor: "var(--color-dark-border)" }}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg" style={{ background: "var(--color-primary-dim)", color: "var(--color-primary)" }}>
          <SlidersHorizontal size={15} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold" style={{ color: "var(--color-text-primary)" }}>Room mix</span>
          <span className="mt-0.5 block text-[10px]" style={{ color: "var(--color-text-muted)" }}>Balance voice and music for everyone</span>
        </span>
        <ChevronDown size={15} style={{ color: "var(--color-text-muted)" }} />
      </button>
    );
  }

  const handleRelease = () => {
    // Send chat announcement once when user releases the slider
    onDone?.(voice / 100, music / 100);
  };

  return (
    <div className="mt-3 rounded-xl border p-3.5" style={{ background: "color-mix(in srgb, var(--color-dark-card) 55%, transparent)", borderColor: "color-mix(in srgb, var(--color-primary) 25%, var(--color-dark-border))", animation: "fade-in 0.18s ease-out" }}>
      <div className="mb-3 flex items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg" style={{ background: "var(--color-primary-dim)", color: "var(--color-primary)" }}>
          <SlidersHorizontal size={15} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold" style={{ color: "var(--color-text-primary)" }}>Room mix</span>
          <span className="block text-[10px]" style={{ color: "var(--color-text-muted)" }}>Changes are shared with everyone</span>
        </span>
        <button onClick={() => setExpanded(false)} className="cursor-pointer rounded-lg px-2.5 py-1.5 text-[10px] font-medium transition-colors hover:bg-[var(--color-dark-card)]" style={{ color: "var(--color-text-secondary)" }}>Done</button>
      </div>
      <div className="space-y-2" onPointerUp={handleRelease} onKeyUp={(e) => { if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)) handleRelease(); }}>
        <MixSlider label="Voice" icon={<Mic size={13} style={{ color: "var(--color-primary)" }} />} value={voice} onChange={(v) => { setVoice(v); sendThrottled(v, music); }} />
        <MixSlider label="Music" icon={<Music size={13} style={{ color: "var(--color-accent)" }} />} value={music} onChange={(v) => { setMusic(v); sendThrottled(voice, v); }} />
      </div>
    </div>
  );
}
