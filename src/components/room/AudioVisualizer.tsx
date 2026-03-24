"use client";

import { useEffect, useRef, useState } from "react";
import type { Room } from "livekit-client";
import { Track } from "livekit-client";

interface AudioVisualizerProps {
  room: Room | null;
  isActive: boolean;
  children: React.ReactNode;
  ambientId?: string; // ID of the ambient background div to pulse
}

// Shared analyser
let vizCtx: AudioContext | null = null;
let vizAnalyser: AnalyserNode | null = null;
let vizSource: MediaStreamAudioSourceNode | null = null;
let lastTrackId: string | null = null;
let dataBuffer: Uint8Array | null = null;

function getOrSetupAnalyser(room: Room | null): AnalyserNode | null {
  if (!room) return null;

  let mediaTrack: MediaStreamTrack | null = null;

  for (const [, participant] of room.remoteParticipants) {
    for (const [, pub] of participant.trackPublications) {
      if (pub.track && pub.isSubscribed && pub.track.kind === Track.Kind.Audio) {
        if (pub.source === Track.Source.ScreenShareAudio) {
          mediaTrack = pub.track.mediaStreamTrack;
          break;
        }
        if (!mediaTrack) mediaTrack = pub.track.mediaStreamTrack;
      }
    }
    if (mediaTrack) break;
  }

  if (!mediaTrack) {
    const localPub = room.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio);
    if (localPub?.track) mediaTrack = localPub.track.mediaStreamTrack;
  }

  // Fallback: grab from any music audio element in the DOM
  if (!mediaTrack) {
    const audioEl = document.querySelector<HTMLAudioElement>('audio[data-lk-type="music"]');
    if (audioEl?.srcObject instanceof MediaStream) {
      mediaTrack = audioEl.srcObject.getAudioTracks()[0] ?? null;
    }
  }

  if (!mediaTrack || mediaTrack.readyState !== "live") return null;
  if (mediaTrack.id === lastTrackId && vizAnalyser) return vizAnalyser;
  lastTrackId = mediaTrack.id;

  if (!vizCtx || vizCtx.state === "closed") {
    vizCtx = new AudioContext({ sampleRate: 48000 });
  }

  vizSource?.disconnect();
  vizSource = vizCtx.createMediaStreamSource(new MediaStream([mediaTrack]));
  vizAnalyser = vizCtx.createAnalyser();
  vizAnalyser.fftSize = 64; // 32 bins — we only need overall energy
  vizAnalyser.smoothingTimeConstant = 0.85;
  vizSource.connect(vizAnalyser);
  dataBuffer = new Uint8Array(vizAnalyser.frequencyBinCount);

  return vizAnalyser;
}

// Compute audio energy bands for the glow effect
function getAudioEnergy(analyser: AnalyserNode | null): { bass: number; mid: number; high: number; overall: number } {
  if (!analyser || !dataBuffer) return { bass: 0, mid: 0, high: 0, overall: 0 };

  analyser.getByteFrequencyData(dataBuffer as Uint8Array<ArrayBuffer>);

  const len = dataBuffer.length;
  const third = Math.floor(len / 3);
  let bass = 0, mid = 0, high = 0;

  for (let i = 0; i < third; i++) bass += dataBuffer[i]!;
  for (let i = third; i < third * 2; i++) mid += dataBuffer[i]!;
  for (let i = third * 2; i < len; i++) high += dataBuffer[i]!;

  bass = bass / (third * 255);
  mid = mid / (third * 255);
  high = high / ((len - third * 2) * 255);
  const overall = (bass * 0.5 + mid * 0.35 + high * 0.15); // weighted toward bass

  return { bass, mid, high, overall };
}

export function AudioVisualizer({ room, isActive, children, ambientId }: AudioVisualizerProps) {
  const rafRef = useRef<number>(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const trackCheckCounter = useRef(0);
  const cachedAnalyser = useRef<AnalyserNode | null>(null);
  const [glow, setGlow] = useState({ bass: 0, mid: 0, high: 0, overall: 0 });

  useEffect(() => {
    if (!isActive || !room) {
      cancelAnimationFrame(rafRef.current);
      setGlow({ bass: 0, mid: 0, high: 0, overall: 0 });
      return;
    }

    let running = true;

    const update = () => {
      if (!running) return;

      trackCheckCounter.current++;
      if (trackCheckCounter.current >= 30 || !cachedAnalyser.current) {
        cachedAnalyser.current = getOrSetupAnalyser(room);
        trackCheckCounter.current = 0;
      }

      const energy = getAudioEnergy(cachedAnalyser.current);

      // Apply glow via DOM style directly (avoids React re-render at 60fps)
      const el = wrapperRef.current;
      if (el) {
        const intensity = energy.overall;
        const spread = Math.round(12 + intensity * 36); // 12-48px
        const opacity = Math.min(intensity * 1.5, 0.85);

        // Multi-color glow: violet from bass, amber from highs
        const violetGlow = `0 0 ${spread}px rgba(139, 92, 246, ${opacity * Math.max(energy.bass, 0.3)})`;
        const amberGlow = `0 0 ${Math.round(spread * 0.8)}px rgba(245, 158, 11, ${opacity * energy.high * 2.5})`;
        const innerGlow = `inset 0 0 ${Math.round(spread * 0.5)}px rgba(139, 92, 246, ${opacity * 0.4})`;

        el.style.boxShadow = `${violetGlow}, ${amberGlow}, ${innerGlow}`;
        el.style.borderColor = intensity > 0.15
          ? `rgba(139, 92, 246, ${0.4 + intensity * 0.6})`
          : "";
      }

      // Ambient viewport background — subtle color shift with music
      if (ambientId) {
        const ambientEl = document.getElementById(ambientId);
        if (ambientEl) {
          // Bass → violet blob (bottom-left), Highs → amber blob (top-right)
          const bassOpacity = 0.03 + energy.bass * 0.1; // 3% → 13%
          const highOpacity = 0.02 + energy.high * 0.08; // 2% → 10%
          const bassSize = 40 + energy.bass * 20; // 40% → 60% spread
          const highSize = 35 + energy.high * 15;

          ambientEl.style.background =
            `radial-gradient(ellipse ${bassSize}% ${bassSize}% at 20% 80%, rgba(139, 92, 246, ${bassOpacity}), transparent), ` +
            `radial-gradient(ellipse ${highSize}% ${highSize}% at 80% 20%, rgba(245, 158, 11, ${highOpacity}), transparent)`;
        }
      }

      rafRef.current = requestAnimationFrame(update);
    };

    rafRef.current = requestAnimationFrame(update);

    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
      vizSource?.disconnect();
      vizSource = null;
      vizAnalyser = null;
      lastTrackId = null;
      cachedAnalyser.current = null;
      // Reset glow
      if (wrapperRef.current) {
        wrapperRef.current.style.boxShadow = "";
        wrapperRef.current.style.borderColor = "";
      }
    };
  }, [isActive, room]);

  return (
    <div
      ref={wrapperRef}
      className="rounded-xl border transition-[border-color] duration-150"
      style={{
        borderColor: isActive ? "rgba(139, 92, 246, 0.4)" : "var(--color-dark-border)",
      }}
    >
      {children}
    </div>
  );
}
