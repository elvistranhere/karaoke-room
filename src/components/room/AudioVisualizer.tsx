"use client";

import { useEffect, useRef } from "react";
import type { Room } from "livekit-client";
import { Track } from "livekit-client";

interface AudioVisualizerProps {
  room: Room | null;
  isActive: boolean;
}

// Shared analyser — reuses single AudioContext
let vizCtx: AudioContext | null = null;
let vizAnalyser: AnalyserNode | null = null;
let vizSource: MediaStreamAudioSourceNode | null = null;
let lastTrackId: string | null = null;
let dataBuffer: Uint8Array | null = null; // reused across frames

function getOrSetupAnalyser(room: Room | null): AnalyserNode | null {
  if (!room) return null;

  // Find audio to visualize
  let mediaTrack: MediaStreamTrack | null = null;

  // Check remote participants for screen share audio (listener)
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

  // Check local participant (singer)
  if (!mediaTrack) {
    const localPub = room.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio);
    if (localPub?.track) mediaTrack = localPub.track.mediaStreamTrack;
  }

  // No track found — return null (not stale analyser)
  if (!mediaTrack || mediaTrack.readyState !== "live") return null;

  // Only re-setup if track changed
  if (mediaTrack.id === lastTrackId && vizAnalyser) return vizAnalyser;
  lastTrackId = mediaTrack.id;

  if (!vizCtx || vizCtx.state === "closed") {
    vizCtx = new AudioContext({ sampleRate: 48000 });
  }

  vizSource?.disconnect();
  vizSource = vizCtx.createMediaStreamSource(new MediaStream([mediaTrack]));
  vizAnalyser = vizCtx.createAnalyser();
  vizAnalyser.fftSize = 128;
  vizAnalyser.smoothingTimeConstant = 0.82;
  vizSource.connect(vizAnalyser);

  dataBuffer = new Uint8Array(vizAnalyser.frequencyBinCount);

  return vizAnalyser;
}

export function AudioVisualizer({ room, isActive }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const lastW = useRef(0);
  const lastH = useRef(0);
  // Throttle track lookup — not every frame
  const trackCheckCounter = useRef(0);
  const cachedAnalyser = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    if (!isActive || !room) {
      cancelAnimationFrame(rafRef.current);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let running = true;

    const draw = () => {
      if (!running) return;

      // Lookup track every 30 frames (~500ms at 60fps) instead of every frame
      trackCheckCounter.current++;
      if (trackCheckCounter.current >= 30 || !cachedAnalyser.current) {
        cachedAnalyser.current = getOrSetupAnalyser(room);
        trackCheckCounter.current = 0;
      }

      const analyser = cachedAnalyser.current;

      // Only resize when dimensions actually change
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const newW = Math.round(rect.width * dpr);
      const newH = Math.round(rect.height * dpr);
      if (canvas.width !== newW || canvas.height !== newH) {
        canvas.width = newW;
        canvas.height = newH;
        ctx.scale(dpr, dpr);
      }

      const w = rect.width;
      const h = rect.height;

      ctx.clearRect(0, 0, w, h);

      if (!analyser || !dataBuffer) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      analyser.getByteFrequencyData(dataBuffer);

      const barCount = dataBuffer.length;
      const barWidth = w / barCount;
      const gap = 1.5;

      // Mirror layout: bars spread from center outward
      // Left half = frequency data reversed, Right half = frequency data normal
      // This fills the full width evenly instead of bunching energy on the left
      const half = Math.floor(barCount / 2);
      const mirrorBarWidth = w / barCount;

      for (let pass = 0; pass < 2; pass++) {
        // pass 0 = glow, pass 1 = crisp bars
        for (let i = 0; i < barCount; i++) {
          // Map visual position to frequency index (mirror from center)
          const freqIdx = i < half ? (half - 1 - i) : (i - half);
          const value = dataBuffer[freqIdx]! / 255;
          const barHeight = value * h * 0.9;
          if (barHeight < (pass === 0 ? 3 : 2)) continue;

          const x = i * mirrorBarWidth;
          const t = freqIdx / barCount;
          const r = Math.round(139 + (245 - 139) * t);
          const g = Math.round(92 + (158 - 92) * t);
          const b = Math.round(246 + (11 - 246) * t);

          if (pass === 0) {
            // Glow layer
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${value * 0.15})`;
            ctx.fillRect(x - 1, h - barHeight - 2, Math.max(mirrorBarWidth + 2, 3), barHeight + 2);
          } else {
            // Crisp bar
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.6 + value * 0.4})`;
            const bw = Math.max(mirrorBarWidth - gap, 1);
            const radius = Math.min(bw / 2, 2);
            ctx.beginPath();
            ctx.roundRect(x + gap / 2, h - barHeight, bw, barHeight, [radius, radius, 0, 0]);
            ctx.fill();
          }
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
      // Clean up nodes but keep context alive for reuse
      vizSource?.disconnect();
      vizSource = null;
      vizAnalyser = null;
      lastTrackId = null;
      cachedAnalyser.current = null;
    };
  }, [isActive, room]);

  if (!isActive) return null;

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-x-0 bottom-0 h-16 w-full opacity-70"
      style={{ borderRadius: "0 0 0.75rem 0.75rem" }}
    />
  );
}
