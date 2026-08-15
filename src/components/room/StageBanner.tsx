"use client";

import { useState, useEffect } from "react";
import type { Room } from "livekit-client";
import type { RoomState } from "~/types/room";
import { Mic, MicOff, Music, VolumeX, Volume2, Plus } from "lucide-react";
import { AudioVisualizer } from "./AudioVisualizer";
import { PlaybackControls } from "./PlaybackControls";
import { SyncOffsetControl } from "./SyncOffsetControl";
import { VideoUrlInput } from "./VideoUrlInput";
import { VolumeSlider, MUSIC_MAX } from "./VolumeSlider";

interface StageBannerProps {
  room: Room | null;
  roomState: RoomState;
  isMyTurn: boolean;
  onFinishSinging: () => void;
  audioError: string | null;
  singerSongName: string | null;
  singerIdentity: string | null;
  onAddToQueue?: () => void;
  onSetSongName?: (name: string) => void;
  // Playback (singer only)
  onLoadVideo?: (videoId: string) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onRestart?: () => void;
  playbackReady?: boolean;
  // Singer-local: own player volume; never broadcast
  onMixMusicGain?: (val: number) => void;
  ambientId?: string;
  ambientColor?: "violet" | "amber";
  onMuteAll?: () => void;
  onUnmuteAll?: () => void;
  isMutedAll?: boolean;
  mixMusicValue?: number;
  // Listener-local mix: voice is the singer's stage volume on this device only,
  // the same number the People panel row edits
  listenerVoiceValue?: number;
  onListenerVoiceChange?: (val: number) => void;
  listenerVoiceMuted?: boolean;
  onToggleListenerVoiceMute?: () => void;
  // Listener-local sync offset (auto-estimated, manual override remembered per singer)
  syncAuto?: boolean;
  onSyncAutoChange?: (auto: boolean) => void;
  autoOffsetMs?: number;
  syncOffsetMs?: number;
  onSyncOffsetChange?: (ms: number) => void;
  syncSingerName?: string | null;
}

export function StageBanner({
  room,
  roomState,
  isMyTurn,
  onFinishSinging,
  audioError,
  singerSongName,
  singerIdentity,
  onAddToQueue,
  onSetSongName,
  onLoadVideo,
  onPlay,
  onPause,
  onRestart,
  playbackReady = false,
  onMixMusicGain,
  ambientId,
  ambientColor,
  onMuteAll,
  onUnmuteAll,
  isMutedAll = false,
  mixMusicValue = 70,
  listenerVoiceValue = 100,
  onListenerVoiceChange,
  listenerVoiceMuted = false,
  onToggleListenerVoiceMute,
  syncAuto = true,
  onSyncAutoChange,
  autoOffsetMs = 150,
  syncOffsetMs = 150,
  onSyncOffsetChange,
  syncSingerName = null,
}: StageBannerProps) {
  const [liveRoomLevel, setLiveRoomLevel] = useState(0);
  const currentSinger = roomState.participants.find(
    (p) => p.id === roomState.currentSingerId,
  );

  const isSomeoneSinging = !!roomState.currentSingerId;
  const video = roomState.video;
  const hasVideo = video !== null;
  const isPlaying = video?.playing ?? false;
  const voicePercent = listenerVoiceMuted ? 0 : Math.round(listenerVoiceValue);
  const meterBars = [0.35, 0.55, 0.78, 1, 0.78, 0.55, 0.35];

  useEffect(() => {
    if (!room || !isSomeoneSinging || isMyTurn || voicePercent === 0) {
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
  }, [room, isSomeoneSinging, isMyTurn, voicePercent]);

  // No one singing - compact idle state
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

  // Someone else singing - informational banner with volume
  if (!isMyTurn) {
    return (
      <AudioVisualizer room={room} isActive={isSomeoneSinging} singerIdentity={singerIdentity} ambientId={ambientId} ambientColor={ambientColor} className="h-full w-full">
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
            aria-valuenow={Math.min(100, Math.round(liveRoomLevel * voicePercent))}
            title={voicePercent === 0 ? "Voice muted" : `Live voice level ${Math.round(liveRoomLevel * 100)}%`}
          >
            {meterBars.map((shape, index) => (
              <span
                key={`${shape}-${index}`}
                className="w-0.5 rounded-full"
                style={{
                  height: `${Math.max(5, Math.min(38, 5 + liveRoomLevel * 40 * shape))}px`,
                  background: voicePercent === 0 ? "var(--color-text-muted)" : "#b78cff",
                  opacity: voicePercent === 0 ? 0.25 : 0.55 + liveRoomLevel * 0.45,
                  transition: "height 90ms ease-out, opacity 120ms ease-out",
                }}
              />
            ))}
          </div>
        </div>

        {/* Local mix - only changes what this listener hears */}
        {onListenerVoiceChange && onMixMusicGain && (
          <div className="mt-5 space-y-2 rounded-xl p-3.5" style={{ background: "var(--color-dark-card)" }}>
            <VolumeSlider
              label="Voice"
              icon={voicePercent === 0 ? <VolumeX size={14} style={{ color: "var(--color-text-muted)" }} /> : <Mic size={14} style={{ color: "var(--color-primary)" }} />}
              value={listenerVoiceValue}
              ariaLabel={`Stage volume for ${currentSinger?.name ?? "the singer"}`}
              onChange={onListenerVoiceChange}
              trailing={onToggleListenerVoiceMute ? (
                <button
                  onClick={onToggleListenerVoiceMute}
                  className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md transition-all hover:brightness-125"
                  style={{
                    background: listenerVoiceMuted ? "var(--color-danger-dim)" : "transparent",
                    color: listenerVoiceMuted ? "var(--color-danger)" : "var(--color-text-muted)",
                  }}
                  title={listenerVoiceMuted ? "Unmute this singer for yourself" : "Mute this singer for yourself"}
                  aria-label={listenerVoiceMuted ? "Unmute this singer for yourself" : "Mute this singer for yourself"}
                >
                  {listenerVoiceMuted ? <MicOff size={13} /> : <Mic size={13} />}
                </button>
              ) : undefined}
            />
            <VolumeSlider
              label="Music"
              icon={<Music size={14} style={{ color: "var(--color-accent)" }} />}
              value={mixMusicValue}
              max={MUSIC_MAX}
              onChange={(v) => onMixMusicGain(v / 100)}
            />
            <p className="pt-1 text-[10px]" style={{ color: "var(--color-text-muted)" }}>
              {listenerVoiceMuted
                ? "Muted for you. Unmuting restores this level. YouTube caps music at 100%."
                : "Only changes what you hear. YouTube caps music at 100%."}
            </p>
          </div>
        )}
        {onSyncAutoChange && onSyncOffsetChange && (
          <div className="mt-2 rounded-xl p-3.5" style={{ background: "var(--color-dark-card)" }}>
            <SyncOffsetControl
              auto={syncAuto}
              onAutoChange={onSyncAutoChange}
              autoOffsetMs={autoOffsetMs}
              offsetMs={syncOffsetMs}
              onOffsetChange={onSyncOffsetChange}
              singerName={syncSingerName}
            />
          </div>
        )}

      </div>
      </AudioVisualizer>
    );
  }

  // My turn - expanded with controls
  return (
    <AudioVisualizer room={room} isActive={hasVideo} singerIdentity={singerIdentity} ambientId={ambientId} ambientColor={ambientColor} framed={hasVideo} className="h-full w-full">
    <div
      className={`relative flex h-full flex-col overflow-hidden rounded-2xl border ${hasVideo ? "p-4" : "justify-center p-6 sm:p-8"}`}
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

      {!hasVideo ? (
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
            Paste a YouTube link and everyone in the room watches it with you, in sync.
          </p>

          <div className="mt-6 space-y-2">
            {onLoadVideo && <VideoUrlInput onLoad={onLoadVideo} label="Put on stage" autoFocus />}
            <button
              onClick={onFinishSinging}
              className="w-full cursor-pointer rounded-lg px-4 py-2 text-xs transition-colors hover:bg-white/5"
              style={{ color: "var(--color-text-muted)" }}
            >
              Leave stage
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Mic size={20} style={{ color: "var(--color-primary)" }} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}>
                On stage
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-success)", animation: "fade-in 1.5s ease-in-out infinite alternate" }} />
              <span className="text-xs" style={{ color: "var(--color-success)" }}>Live</span>
            </div>
          </div>

          {/* Song name - always editable */}
          {onSetSongName && (
            <SongNameInput initial={singerSongName ?? ""} onSet={onSetSongName} />
          )}

          {onPlay && onPause && onRestart && (
            <PlaybackControls playing={isPlaying} onPlay={onPlay} onPause={onPause} onRestart={onRestart} disabled={!playbackReady} />
          )}

          {onLoadVideo && <VideoUrlInput onLoad={onLoadVideo} label="Change" />}

          {/* Music volume only: the singer never gets a gain stage on their own voice */}
          {onMixMusicGain && (
            <VolumeSlider label="Music" icon={<Music size={14} style={{ color: "var(--color-accent)" }} />} value={mixMusicValue} max={MUSIC_MAX} onChange={(v) => onMixMusicGain(v / 100)} />
          )}

          {/* Stage controls: everything below the separator acts on the room, not on
              this device's volume */}
          {onMuteAll && onUnmuteAll && (
            <div className="border-t pt-3" style={{ borderColor: "var(--color-dark-border)" }}>
              <button
                onClick={isMutedAll ? onUnmuteAll : onMuteAll}
                className="flex w-full cursor-pointer items-center justify-center gap-1 rounded-lg border px-3 py-2 text-xs font-medium transition-all hover:brightness-110"
                style={{
                  borderColor: isMutedAll ? "var(--color-accent)" : "var(--color-dark-border)",
                  background: isMutedAll ? "var(--color-accent-dim)" : "transparent",
                  color: isMutedAll ? "var(--color-accent)" : "var(--color-text-muted)",
                }}
                title={isMutedAll ? "Let everyone use their mic again" : "Stop everyone else from publishing their mic"}
              >
                {isMutedAll ? <VolumeX size={12} /> : <Volume2 size={12} />}
                {isMutedAll ? "Unmute all mics" : "Mute all mics"}
              </button>
            </div>
          )}

          <button
            onClick={onFinishSinging}
            className="w-full cursor-pointer rounded-lg py-2 text-xs font-medium transition-all hover:brightness-110"
            style={{ background: "var(--color-danger-dim)", color: "var(--color-danger)" }}
          >
            Finish Turn
          </button>
        </div>
      )}

    </div>
    </AudioVisualizer>
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
