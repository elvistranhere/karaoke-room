"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Music, Pause, Play, VideoOff } from "lucide-react";

interface VideoStageProps {
  mountRef: React.RefObject<HTMLDivElement | null>;
  hasVideo: boolean;
  ready: boolean;
  embedBlocked: boolean;
  errorCode: number | null;
  isSinger: boolean;
  videoId: string | null;
  playing: boolean;
  songName: string | null;
  showTapToPlay?: boolean;
  onTapToPlay?: () => void;
}

// The player is created once on the audio-unlock gesture and never unmounted, so an
// empty stage parks the container off-screen instead of destroying the iframe.
export function VideoStage({ mountRef, hasVideo, ready, embedBlocked, errorCode, isSinger, videoId, playing, songName, showTapToPlay = false, onTapToPlay }: VideoStageProps) {
  const failed = embedBlocked || errorCode !== null;

  // YouTube paints its own chrome (title bar, More videos wall, logo) over the frame
  // while paused and for a few seconds after playback starts, and no player param can
  // disable it. The veil covers exactly those windows with app-styled content.
  const [veiled, setVeiled] = useState(true);
  const freshVideoRef = useRef(true);

  useEffect(() => {
    freshVideoRef.current = true;
    setVeiled(true);
  }, [videoId]);

  useEffect(() => {
    if (!playing) {
      setVeiled(true);
      return;
    }
    const holdMs = freshVideoRef.current ? 3800 : 1800;
    freshVideoRef.current = false;
    const timer = window.setTimeout(() => setVeiled(false), holdMs);
    return () => window.clearTimeout(timer);
  }, [playing]);

  const showVeil = hasVideo && !failed && ready && veiled && !showTapToPlay;

  return (
    <div
      className={
        hasVideo
          ? "relative w-full shrink-0 rounded-2xl"
          : "pointer-events-none absolute -left-[9999px] top-0 h-px w-px overflow-hidden opacity-0"
      }
      style={
        hasVideo
          ? { aspectRatio: "16 / 9", maxHeight: "46dvh", background: "#000", boxShadow: "var(--shadow-elevation-1)" }
          : undefined
      }
      aria-hidden={!hasVideo}
    >
      {/* inert keeps the iframe out of the tab order; the blocker below stops clicks */}
      <div ref={mountRef} className="absolute inset-0 overflow-hidden rounded-2xl" inert />

      <div className="atmo-frame pointer-events-none absolute inset-0 z-10 rounded-2xl" aria-hidden="true" />

      <div className="absolute inset-0 z-10 rounded-2xl" aria-hidden="true" />

      {showVeil && (
        <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-2xl" aria-hidden="true">
          {videoId && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
              alt=""
              className="h-full w-full scale-110 object-cover blur-2xl"
            />
          )}
          <div className="absolute inset-0" style={{ background: "color-mix(in srgb, var(--color-dark-bg, #09090b) 62%, transparent)" }} />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <span
              className="flex size-14 items-center justify-center rounded-full"
              style={{ background: "color-mix(in srgb, var(--color-dark-surface) 78%, transparent)", color: "var(--color-primary-soft, #c9a7ff)", boxShadow: "var(--shadow-elevation-1)" }}
            >
              {playing ? <Music size={22} /> : <Pause size={22} fill="currentColor" />}
            </span>
            {songName && (
              <p className="max-w-md truncate text-base font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
                {songName}
              </p>
            )}
            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              {playing ? "Here we go" : "Paused"}
            </p>
          </div>
        </div>
      )}

      {hasVideo && !failed && ready && showTapToPlay && onTapToPlay && (
        <button
          onClick={onTapToPlay}
          className="absolute inset-0 z-30 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl"
          style={{ background: "color-mix(in srgb, #000 55%, transparent)" }}
        >
          <span
            className="flex size-14 items-center justify-center rounded-full"
            style={{ background: "var(--color-primary)", color: "#fff", boxShadow: "0 0 24px rgba(157, 92, 255, 0.5)" }}
          >
            <Play size={24} fill="currentColor" />
          </span>
          <span className="text-sm font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
            Tap to play
          </span>
          <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            Your browser needs a tap to start the music
          </span>
        </button>
      )}

      {hasVideo && (failed || !ready) && (
        <div
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-2xl px-6 text-center"
          style={{ background: "color-mix(in srgb, var(--color-dark-surface) 90%, transparent)" }}
        >
          {failed ? (
            <>
              <VideoOff size={26} style={{ color: "var(--color-danger)" }} />
              <p className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}>
                {embedBlocked ? "This video cannot be embedded" : "Video unavailable"}
              </p>
              <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                {isSinger ? "Paste another YouTube link to keep going." : "Waiting for the singer to pick another video."}
              </p>
            </>
          ) : (
            <>
              <LoaderCircle size={22} className="animate-spin" style={{ color: "var(--color-primary)" }} />
              <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                Loading video
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
