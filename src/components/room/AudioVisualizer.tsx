"use client";

import { useEffect, useRef } from "react";
import type { Room } from "livekit-client";
import { Track } from "livekit-client";

interface AudioVisualizerProps {
  room: Room | null;
  isActive: boolean; // only render when someone is singing
}

// Shared analyser for the visualizer — reuses existing audio context pattern
let vizCtx: AudioContext | null = null;
let vizAnalyser: AnalyserNode | null = null;
let vizSource: MediaStreamAudioSourceNode | null = null;
let lastTrackId: string | null = null;

function getOrSetupAnalyser(room: Room | null): AnalyserNode | null {
  if (!room) return null;

  // Find audio to visualize — prefer ScreenShareAudio, fall back to any audio
  let mediaTrack: MediaStreamTrack | null = null;

  // 1. Check remote participants for screen share audio (listener sees singer's stream)
  for (const [, participant] of room.remoteParticipants) {
    for (const [, pub] of participant.trackPublications) {
      if (pub.track && pub.isSubscribed && pub.track.kind === Track.Kind.Audio) {
        // Prefer screen share audio (the karaoke mix)
        if (pub.source === Track.Source.ScreenShareAudio) {
          mediaTrack = pub.track.mediaStreamTrack;
          break;
        }
        // Fall back to any audio track
        if (!mediaTrack) {
          mediaTrack = pub.track.mediaStreamTrack;
        }
      }
    }
    if (mediaTrack && mediaTrack.label.includes("karaoke")) break;
  }

  // 2. Check local participant (if I'm the singer — use the mix destination)
  if (!mediaTrack) {
    const localPub = room.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio);
    if (localPub?.track) {
      mediaTrack = localPub.track.mediaStreamTrack;
    }
  }

  if (!mediaTrack) return vizAnalyser; // keep previous if no new track

  // Only re-setup if track changed
  if (mediaTrack.id === lastTrackId && vizAnalyser) return vizAnalyser;
  lastTrackId = mediaTrack.id;

  // Setup
  if (!vizCtx || vizCtx.state === "closed") {
    vizCtx = new AudioContext({ sampleRate: 48000 });
  }

  vizSource?.disconnect();
  vizSource = vizCtx.createMediaStreamSource(new MediaStream([mediaTrack]));
  vizAnalyser = vizCtx.createAnalyser();
  vizAnalyser.fftSize = 128; // 64 frequency bins — good for visual bars
  vizAnalyser.smoothingTimeConstant = 0.82; // smooth transitions
  vizSource.connect(vizAnalyser);
  // Don't connect to destination — we only want to read data, not play audio

  return vizAnalyser;
}

export function AudioVisualizer({ room, isActive }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

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

      const analyser = getOrSetupAnalyser(room);

      // Resize canvas to match CSS size
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);

      const w = rect.width;
      const h = rect.height;

      // Clear
      ctx.clearRect(0, 0, w, h);

      if (!analyser) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);

      const barCount = data.length;
      const barWidth = w / barCount;
      const gap = 1.5;

      // Draw frequency bars from bottom
      for (let i = 0; i < barCount; i++) {
        const value = data[i]! / 255;
        const barHeight = value * h * 0.9;

        if (barHeight < 2) continue;

        const x = i * barWidth;

        // Gradient: violet at low frequencies → amber at high
        const t = i / barCount;
        const r = Math.round(139 + (245 - 139) * t); // violet → amber
        const g = Math.round(92 + (158 - 92) * t);
        const b = Math.round(246 + (11 - 246) * t);

        // Bar with glow
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.6 + value * 0.4})`;
        ctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${value * 0.5})`;
        ctx.shadowBlur = value * 8;

        // Rounded bar
        const bw = Math.max(barWidth - gap, 1);
        const radius = Math.min(bw / 2, 2);
        ctx.beginPath();
        ctx.roundRect(x + gap / 2, h - barHeight, bw, barHeight, [radius, radius, 0, 0]);
        ctx.fill();
      }

      // Reset shadow
      ctx.shadowBlur = 0;

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
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
