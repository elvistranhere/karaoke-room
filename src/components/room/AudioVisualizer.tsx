"use client";

import { useEffect, useRef } from "react";
import { prefersReducedMotion, setAtmosphereStrength } from "~/lib/atmosphere";

interface AudioVisualizerProps {
  // Narrow source: the singer's live audio track, or null while there is nothing to drive
  getSingerTrack: (() => MediaStreamTrack | null) | null;
  isActive: boolean;
  children: React.ReactNode;
  framed?: boolean;
  className?: string;
}

// Voice is the only measurable energy in the room: YouTube audio never reaches this page,
// so the genre preset's pulse stands in for tempo and this level drives --atmo-strength.
const REDUCED_MOTION_STRENGTH = 0.4;

// --atmo-strength is an inherited registered property on the root, so every write costs a
// document-wide style recalc. Sampling below the 140ms opacity transition stays smooth.
const STRENGTH_INTERVAL_MS = 100;

function getAudioEnergy(analyser: AnalyserNode | null, dataBuffer: Uint8Array | null): number {
  if (!analyser || !dataBuffer) return 0;

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

  return bass * 0.5 + mid * 0.35 + high * 0.15;
}

export function AudioVisualizer({ getSingerTrack, isActive, children, framed = true, className = "" }: AudioVisualizerProps) {
  const rafRef = useRef<number>(0);
  // Held in a ref so a singer change swaps the source without restarting the loop
  const getSingerTrackRef = useRef(getSingerTrack);
  getSingerTrackRef.current = getSingerTrack;
  const hasSource = getSingerTrack !== null;
  const trackCheckCounter = useRef(0);

  const vizCtxRef = useRef<AudioContext | null>(null);
  const vizSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const vizAnalyserRef = useRef<AnalyserNode | null>(null);
  const lastTrackIdRef = useRef<string | null>(null);
  const dataBufferRef = useRef<Uint8Array | null>(null);

  const setupAnalyser = (track: MediaStreamTrack) => {
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
    const root = document.documentElement;

    if (!isActive || !hasSource) {
      cancelAnimationFrame(rafRef.current);
      cleanupViz();
      setAtmosphereStrength(root, 0);
      return;
    }

    if (prefersReducedMotion()) {
      setAtmosphereStrength(root, REDUCED_MOTION_STRENGTH);
      return () => setAtmosphereStrength(root, 0);
    }

    let running = true;
    let lastWriteAt = 0;

    const update = (now: number) => {
      if (!running) return;

      trackCheckCounter.current++;
      if (trackCheckCounter.current >= 10 || !vizAnalyserRef.current) {
        trackCheckCounter.current = 0;
        const track = getSingerTrackRef.current?.() ?? null;
        if (track && track.readyState === "live") {
          setupAnalyser(track);
        } else if (vizAnalyserRef.current) {
          cleanupViz();
        }
      }

      if (now - lastWriteAt >= STRENGTH_INTERVAL_MS) {
        lastWriteAt = now;
        setAtmosphereStrength(root, getAudioEnergy(vizAnalyserRef.current, dataBufferRef.current));
      }
      rafRef.current = requestAnimationFrame(update);
    };

    rafRef.current = requestAnimationFrame(update);

    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
      cleanupViz();
      setAtmosphereStrength(root, 0);
    };
  }, [isActive, hasSource]);

  return (
    <div
      className={`relative ${framed ? "rounded-2xl" : ""} ${className}`}
      style={framed ? { boxShadow: "var(--shadow-elevation-1)" } : undefined}
    >
      {children}
      {framed && <div className="atmo-frame pointer-events-none absolute inset-0" aria-hidden="true" />}
    </div>
  );
}
