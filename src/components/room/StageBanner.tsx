"use client";

import { useState, useEffect } from "react";
import { useAudioLevel } from "~/hooks/useAudioLevel";
import type { RoomState } from "~/types/room";
import { Crown, Mic, Music, Pencil, SkipForward, Volume2, VolumeX, Plus } from "lucide-react";
import { AudioVisualizer } from "./AudioVisualizer";
import { PlaybackControls } from "./PlaybackControls";
import { VideoUrlInput } from "./VideoUrlInput";
import { VolumeSlider, MUSIC_MAX } from "./VolumeSlider";

interface StageBannerProps {
  // Narrow audio surface: a raw 0..1 level source for the meter, a track getter for the
  // glow. The level is smoothed in here so the meter's state stays out of RoomView.
  getSingerLevel: (() => number) | null;
  getSingerTrack: (() => MediaStreamTrack | null) | null;
  roomState: RoomState;
  isMyTurn: boolean;
  onFinishSinging: () => void;
  audioError: string | null;
  onSkipSinger?: () => void;
  singerSongName: string | null;
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
  mixMusicValue?: number;
  // Listener-local mix: the singer's own volume on this device only, the same number
  // the People panel row edits
  listenerVoiceValue?: number;
  onListenerVoiceChange?: (val: number) => void;
  listenerVoiceMuted?: boolean;
  onToggleListenerVoiceMute?: () => void;
  // The mixer is on its <audio> element fallback and this engine ignores element.volume,
  // so the voice slider is inert and only the mute toggle still carries
  volumeControlLost?: boolean;
}

export function StageBanner({
  getSingerLevel,
  getSingerTrack,
  roomState,
  isMyTurn,
  onFinishSinging,
  audioError,
  onSkipSinger,
  singerSongName,
  onAddToQueue,
  onSetSongName,
  onLoadVideo,
  onPlay,
  onPause,
  onRestart,
  playbackReady = false,
  onMixMusicGain,
  mixMusicValue = 70,
  listenerVoiceValue = 100,
  onListenerVoiceChange,
  listenerVoiceMuted = false,
  onToggleListenerVoiceMute,
  volumeControlLost = false,
}: StageBannerProps) {
  const currentSinger = roomState.participants.find(
    (p) => p.id === roomState.currentSingerId,
  );

  const isSomeoneSinging = !!roomState.currentSingerId;
  const video = roomState.video;
  const hasVideo = video !== null;
  const isPlaying = video?.playing ?? false;
  const voicePercent = listenerVoiceMuted ? 0 : Math.round(listenerVoiceValue);
  const meterBars = [0.35, 0.55, 0.78, 1, 0.78, 0.55, 0.35];
  const singerLevel = useAudioLevel(getSingerLevel, isSomeoneSinging && !isMyTurn && voicePercent !== 0);

  // No one singing - compact idle state
  if (!isSomeoneSinging) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-8 text-center">
        <div
          className="mb-4 flex size-16 items-center justify-center rounded-full"
          style={{
            background: "var(--color-primary-dim)",
            boxShadow: "var(--shadow-elevation-0)",
            color: "var(--color-primary-soft)",
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
            style={{
              background: "linear-gradient(135deg, var(--color-primary), color-mix(in oklab, var(--color-primary) 78%, black))",
              color: "#fff",
              boxShadow: "0 0 20px color-mix(in srgb, var(--color-primary) 25%, transparent)",
            }}
          >
            <Plus size={16} />
            Add to queue
          </button>
        )}
        <div className="mt-5 flex items-center gap-2 rounded-full px-3 py-1.5 text-xs" style={{ background: "var(--color-dark-card)", color: "var(--color-text-secondary)" }}>
          <Mic size={13} />
          Nobody is singing right now
        </div>
      </div>
    );
  }

  // Someone else singing - informational banner with volume
  if (!isMyTurn) {
    return (
      <AudioVisualizer getSingerTrack={getSingerTrack} isActive={isSomeoneSinging} className="flex min-h-0 w-full flex-col">
      <div className="atmo-glass relative flex min-h-0 flex-col overflow-hidden rounded-2xl">
        <div className="absolute left-0 top-0 z-10 h-0.5 w-full" style={{ background: "linear-gradient(90deg, var(--color-primary), var(--color-tertiary, #ff5c9d))" }} />
        <div className="my-auto min-h-0 w-full overflow-y-auto p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <Mic size={20} style={{ color: "var(--color-primary)" }} />
          <h2 className="min-w-0 flex-1 truncate text-sm font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}>
            {currentSinger?.name ?? "Someone"} is singing
          </h2>
          <div
            className="hidden h-8 shrink-0 items-center gap-1 sm:flex"
            role="meter"
            aria-label="Live room audio level"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(100, Math.round(singerLevel * voicePercent))}
            title={voicePercent === 0 ? "Voice muted" : `Live voice level ${Math.round(singerLevel * 100)}%`}
          >
            {meterBars.map((shape, index) => (
              <span
                key={`${shape}-${index}`}
                className="w-0.5 rounded-full"
                style={{
                  height: `${Math.max(4, Math.min(26, 4 + singerLevel * 28 * shape))}px`,
                  background: voicePercent === 0 ? "var(--color-text-muted)" : "var(--color-primary-level)",
                  opacity: voicePercent === 0 ? 0.25 : 0.55 + singerLevel * 0.45,
                  transition: "height 90ms ease-out, opacity 120ms ease-out",
                }}
              />
            ))}
          </div>
        </div>

        {singerSongName ? (
          <p data-testid="stage-song-title" className="mt-3 truncate text-sm font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--color-primary-soft, #c9a7ff)" }}>
            {singerSongName}
          </p>
        ) : null}

        {/* Local mix - only changes what this listener hears */}
        {onListenerVoiceChange && onMixMusicGain && (
          <div className="mt-4 space-y-2.5">
            {volumeControlLost ? (
              onToggleListenerVoiceMute ? (
                <button
                  onClick={onToggleListenerVoiceMute}
                  className="flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 text-xs font-medium transition-colors hover:bg-white/5"
                  style={{ color: listenerVoiceMuted ? "var(--color-danger)" : "var(--color-text-secondary)" }}
                  aria-label={`${listenerVoiceMuted ? "Unmute" : "Mute"} ${currentSinger?.name ?? "the singer"} for yourself`}
                >
                  {listenerVoiceMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                  {listenerVoiceMuted ? "Unmute" : "Mute"} {currentSinger?.name ?? "the singer"}
                </button>
              ) : null
            ) : (
            <VolumeSlider
              label="Voice"
              icon={<Volume2 size={14} style={{ color: "var(--color-primary)" }} />}
              value={listenerVoiceValue}
              ariaLabel={`Volume for ${currentSinger?.name ?? "the singer"}`}
              onChange={onListenerVoiceChange}
              trailing={onToggleListenerVoiceMute ? (
                <button
                  onClick={onToggleListenerVoiceMute}
                  className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md transition-all hover:brightness-125"
                  style={{
                    background: listenerVoiceMuted ? "var(--color-danger-dim)" : "transparent",
                    color: listenerVoiceMuted ? "var(--color-danger)" : "var(--color-text-muted)",
                  }}
                  title={`${listenerVoiceMuted ? "Unmute" : "Mute"} ${currentSinger?.name ?? "the singer"} for yourself`}
                  aria-label={`${listenerVoiceMuted ? "Unmute" : "Mute"} ${currentSinger?.name ?? "the singer"} for yourself`}
                >
                  {listenerVoiceMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                </button>
              ) : undefined}
            />
            )}
            <VolumeSlider
              label="Music"
              icon={<Music size={14} style={{ color: "var(--color-primary-soft, #c9a7ff)" }} />}
              value={mixMusicValue}
              max={MUSIC_MAX}
              onChange={(v) => onMixMusicGain(v / 100)}
            />
            {(volumeControlLost || listenerVoiceMuted) && (
              <p className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                {volumeControlLost
                  ? "This device is playing voices directly, so only mute works. Tap to bring the sound back to restore the voice slider."
                  : "Muted for you. Unmuting restores this level."}
              </p>
            )}
          </div>
        )}
        {/* Host-only room action; the crown marks why this button is visible */}
        {onSkipSinger && (
          <button
            onClick={onSkipSinger}
            className="mt-3 flex min-h-10 w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium shadow-[var(--shadow-control)] transition-[filter] duration-150 hover:brightness-110"
            style={{ background: "var(--color-dark-card)", color: "var(--color-text-secondary)" }}
            title="You see this because you are the host"
          >
            <Crown size={12} style={{ color: "var(--color-accent)" }} />
            <SkipForward size={12} />
            Skip singer
          </button>
        )}

        </div>
      </div>
      </AudioVisualizer>
    );
  }

  // My turn - expanded with controls
  return (
    <AudioVisualizer getSingerTrack={getSingerTrack} isActive={hasVideo} framed={hasVideo} className="flex min-h-0 w-full flex-col">
    <div
      className="atmo-glass relative flex min-h-0 flex-col overflow-hidden rounded-2xl"
      style={{ boxShadow: "var(--shadow-elevation-1)" }}
    >
      <div
        className="absolute left-0 top-0 z-10 h-0.5 w-full"
        style={{ background: "linear-gradient(90deg, var(--color-primary), var(--color-tertiary, #ff5c9d))" }}
      />

      <div className={`min-h-0 w-full overflow-y-auto ${hasVideo ? "p-4" : "my-auto p-6 sm:p-8"}`}>
      {audioError && (
        <div className="mb-3 rounded-lg px-3 py-2 text-xs" style={{ background: "var(--color-danger-dim)", color: "var(--color-danger)" }}>
          {audioError}
        </div>
      )}

      {!hasVideo ? (
        <div className="mx-auto w-full max-w-lg text-center">
          <div
            className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full"
            style={{ background: "var(--color-primary-dim)", boxShadow: "var(--shadow-elevation-0)", color: "var(--color-primary-soft)" }}
          >
            <Mic size={26} />
          </div>
          <span className="rounded-full px-2.5 py-1 text-[10px] font-semibold" style={{ background: "var(--color-primary-dim)", color: "var(--color-primary-bright)" }}>
            You&apos;re up
          </span>
          <h2 className="mt-3 text-xl font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
            Your turn to sing
          </h2>
          {singerSongName && <p className="mt-1 text-sm" style={{ color: "var(--color-primary-soft, #c9a7ff)" }}>{singerSongName}</p>}
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
          </div>

          {/* Song name - always editable */}
          {onSetSongName && (
            <SongNameInput initial={singerSongName ?? ""} onSet={onSetSongName} />
          )}

          {/* Transport and music live on one row: both act on playback, and the
              slider fills the space the centered island used to waste */}
          <div className="flex items-center gap-4">
            {onPlay && onPause && onRestart && (
              <PlaybackControls playing={isPlaying} onPlay={onPlay} onPause={onPause} onRestart={onRestart} disabled={!playbackReady} />
            )}
            {onMixMusicGain && (
              <div className="min-w-0 flex-1">
                <VolumeSlider label="Music" icon={<Music size={14} style={{ color: "var(--color-primary-soft, #c9a7ff)" }} />} value={mixMusicValue} max={MUSIC_MAX} onChange={(v) => onMixMusicGain(v / 100)} />
              </div>
            )}
          </div>

          {onLoadVideo && <VideoUrlInput onLoad={onLoadVideo} label="Change" />}

          <div className="grid grid-cols-1 gap-2 pt-1">
            <button
              onClick={onFinishSinging}
              className="min-h-10 cursor-pointer rounded-xl px-3 py-2 text-xs font-semibold shadow-[var(--shadow-control)] transition-[background-color,filter] duration-150 hover:brightness-125"
              style={{ background: "var(--color-danger-dim)", color: "var(--color-danger)" }}
            >
              Finish Turn
            </button>
          </div>
        </div>
      )}
      </div>

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
        className="flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm font-semibold transition-all hover:bg-[var(--color-dark-card)]"
        style={{ fontFamily: "var(--font-display)", color: value ? "var(--color-primary-soft, #c9a7ff)" : "var(--color-text-secondary)" }}
        aria-label={value ? `Song: ${value}. Edit song name` : "Set song name"}
      >
        <span className="flex-1 truncate">{value || "What are you singing?"}</span>
        <Pencil size={13} className="shrink-0" style={{ color: "var(--color-primary-soft, #c9a7ff)" }} />
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
