"use client";

import { LoaderCircle, VideoOff } from "lucide-react";

interface VideoStageProps {
  mountRef: React.RefObject<HTMLDivElement | null>;
  hasVideo: boolean;
  ready: boolean;
  embedBlocked: boolean;
  errorCode: number | null;
  isSinger: boolean;
}

// The player is created once on the audio-unlock gesture and never unmounted, so an
// empty stage parks the container off-screen instead of destroying the iframe.
export function VideoStage({ mountRef, hasVideo, ready, embedBlocked, errorCode, isSinger }: VideoStageProps) {
  const failed = embedBlocked || errorCode !== null;

  return (
    <div
      className={
        hasVideo
          ? "relative w-full shrink-0 overflow-hidden rounded-2xl border"
          : "pointer-events-none absolute -left-[9999px] top-0 h-px w-px overflow-hidden opacity-0"
      }
      style={
        hasVideo
          ? { aspectRatio: "16 / 9", maxHeight: "46dvh", background: "#000", borderColor: "var(--color-dark-border)" }
          : undefined
      }
      aria-hidden={!hasVideo}
    >
      {/* inert keeps the iframe out of the tab order; the blocker below stops clicks */}
      <div ref={mountRef} className="absolute inset-0" inert />

      <div className="absolute inset-0 z-10" aria-hidden="true" />

      {hasVideo && (failed || !ready) && (
        <div
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 px-6 text-center"
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
