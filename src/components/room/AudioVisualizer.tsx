"use client";

import { useEffect, useRef } from "react";
import type { Room } from "livekit-client";
import { Track } from "livekit-client";
import { VOICE_TRACK_NAME } from "~/hooks/useLiveKit";

interface AudioVisualizerProps {
  room: Room | null;
  isActive: boolean;
  children: React.ReactNode;
  singerIdentity?: string | null;
  ambientId?: string;
  ambientColor?: "violet" | "amber";
  framed?: boolean;
  className?: string;
}

// Per-instance state is now inside the component via refs (not module-level)
// to avoid cross-instance cache contamination.

function findSingerVoiceTrack(room: Room, singerIdentity: string | null): MediaStreamTrack | null {
  if (!singerIdentity) return null;

  // Priority 1: the singer's published voice track
  for (const [, participant] of room.remoteParticipants) {
    if (participant.identity !== singerIdentity) continue;
    let unnamed: MediaStreamTrack | null = null;
    for (const [, pub] of participant.trackPublications) {
      if (!pub.track || !pub.isSubscribed || pub.track.kind !== Track.Kind.Audio) continue;
      if (pub.trackName === VOICE_TRACK_NAME) return pub.track.mediaStreamTrack;
      if (!pub.isMuted && !unnamed) unnamed = pub.track.mediaStreamTrack;
    }
    if (unnamed) return unnamed;
  }

  // Priority 2: the local voice track (the singer's own view)
  if (room.localParticipant.identity === singerIdentity) {
    for (const [, pub] of room.localParticipant.trackPublications) {
      if (pub.trackName === VOICE_TRACK_NAME && pub.track) return pub.track.mediaStreamTrack;
    }
  }

  return null;
}

function getAudioEnergy(analyser: AnalyserNode | null, dataBuffer: Uint8Array | null): { bass: number; mid: number; high: number; overall: number } {
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
  const overall = (bass * 0.5 + mid * 0.35 + high * 0.15);

  return { bass, mid, high, overall };
}

export function AudioVisualizer({ room, isActive, children, singerIdentity = null, ambientId, ambientColor = "violet", framed = true, className = "" }: AudioVisualizerProps) {
  const rafRef = useRef<number>(0);
  const singerIdentityRef = useRef(singerIdentity);
  singerIdentityRef.current = singerIdentity;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const trackCheckCounter = useRef(0);

  // Per-instance audio state (not shared module-level)
  const vizCtxRef = useRef<AudioContext | null>(null);
  const vizSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const vizAnalyserRef = useRef<AnalyserNode | null>(null);
  const lastTrackIdRef = useRef<string | null>(null);
  const dataBufferRef = useRef<Uint8Array | null>(null);

  const setupAnalyser = (track: MediaStreamTrack) => {
    // Same track — reuse
    if (track.id === lastTrackIdRef.current && vizAnalyserRef.current) return;

    lastTrackIdRef.current = track.id;

    if (!vizCtxRef.current || vizCtxRef.current.state === "closed") {
      vizCtxRef.current = new AudioContext({ sampleRate: 48000 });
    }

    vizSourceRef.current?.disconnect();
    vizSourceRef.current = vizCtxRef.current.createMediaStreamSource(new MediaStream([track]));
    vizAnalyserRef.current = vizCtxRef.current.createAnalyser();
    vizAnalyserRef.current.fftSize = 64;
    vizAnalyserRef.current.smoothingTimeConstant = 0.85;
    vizSourceRef.current.connect(vizAnalyserRef.current);
    dataBufferRef.current = new Uint8Array(vizAnalyserRef.current.frequencyBinCount);
  };

  const cleanupViz = () => {
    vizSourceRef.current?.disconnect();
    vizSourceRef.current = null;
    vizAnalyserRef.current = null;
    lastTrackIdRef.current = null;
    dataBufferRef.current = null;
    if (vizCtxRef.current && vizCtxRef.current.state !== "closed") {
      void vizCtxRef.current.close().catch(() => {});
    }
    vizCtxRef.current = null;
  };

  useEffect(() => {
    if (!isActive || !room) {
      cancelAnimationFrame(rafRef.current);
      cleanupViz();
      // Reset glow + ambient background
      if (wrapperRef.current) {
        wrapperRef.current.style.boxShadow = "";
        wrapperRef.current.style.borderColor = "var(--color-dark-border)";
      }
      if (ambientId) {
        const ambientEl = document.getElementById(ambientId);
        if (ambientEl) ambientEl.style.background = "";
      }
      return;
    }

    let running = true;

    const update = () => {
      if (!running) return;

      trackCheckCounter.current++;
      // Check for track every 10 frames (~170ms) instead of 30 (~500ms)
      if (trackCheckCounter.current >= 10 || !vizAnalyserRef.current) {
        trackCheckCounter.current = 0;
        const track = findSingerVoiceTrack(room, singerIdentityRef.current);
        if (track && track.readyState === "live") {
          setupAnalyser(track);
        } else if (vizAnalyserRef.current) {
          // Track went dead (singer changed) - clear analyser so next poll finds new track
          cleanupViz();
        }
      }

      const energy = getAudioEnergy(vizAnalyserRef.current, dataBufferRef.current);

      const el = wrapperRef.current;
      if (el) {
        const intensity = energy.overall;
        const spread = Math.round(18 + intensity * 50);
        const opacity = Math.min(intensity * 2.0, 0.95);

        const violetGlow = `0 0 ${spread}px rgba(139, 92, 246, ${opacity * Math.max(energy.bass, 0.4)})`;
        const amberGlow = `0 0 ${Math.round(spread * 0.8)}px rgba(245, 158, 11, ${opacity * energy.high * 3})`;
        const innerGlow = `inset 0 0 ${Math.round(spread * 0.6)}px rgba(139, 92, 246, ${opacity * 0.5})`;

        el.style.boxShadow = `${violetGlow}, ${amberGlow}, ${innerGlow}`;
        el.style.borderColor = intensity > 0.08
          ? `rgba(139, 92, 246, ${0.5 + intensity * 0.5})`
          : "var(--color-dark-border)";
      }

      if (ambientId) {
        const ambientEl = document.getElementById(ambientId);
        if (ambientEl) {
          const bassOpacity = 0.05 + energy.bass * 0.18;
          const highOpacity = 0.03 + energy.high * 0.14;
          const bassSize = 45 + energy.bass * 30;
          const highSize = 38 + energy.high * 22;

          const bassColor = ambientColor === "violet"
            ? `rgba(139, 92, 246, ${bassOpacity})`
            : `rgba(245, 158, 11, ${bassOpacity})`;
          const highColor = ambientColor === "violet"
            ? `rgba(245, 158, 11, ${highOpacity})`
            : `rgba(139, 92, 246, ${highOpacity})`;
          ambientEl.style.background =
            `radial-gradient(ellipse ${bassSize}% ${bassSize}% at 20% 80%, ${bassColor}, transparent), ` +
            `radial-gradient(ellipse ${highSize}% ${highSize}% at 80% 20%, ${highColor}, transparent)`;
        }
      }

      rafRef.current = requestAnimationFrame(update);
    };

    rafRef.current = requestAnimationFrame(update);

    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
      cleanupViz();
      if (wrapperRef.current) {
        wrapperRef.current.style.boxShadow = "";
        wrapperRef.current.style.borderColor = "var(--color-dark-border)";
      }
      if (ambientId) {
        const ambientEl = document.getElementById(ambientId);
        if (ambientEl) ambientEl.style.background = "";
      }
    };
  }, [isActive, room, ambientId, ambientColor]);

  return (
    <div
      ref={wrapperRef}
      className={`${framed ? "rounded-2xl border transition-[border-color] duration-150" : ""} ${className}`}
      style={{
        borderColor: framed ? (isActive ? "rgba(139, 92, 246, 0.4)" : "var(--color-dark-border)") : undefined,
      }}
    >
      {children}
    </div>
  );
}
