"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseMicrophoneReturn {
  micStream: MediaStream | null;
  isMuted: boolean;
  toggleMute: () => void;
  startMic: () => Promise<void>;
  stopMic: () => void;
  error: string | null;
}

export function useMicrophone(): UseMicrophoneReturn {
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopMic = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setMicStream(null);
      setIsMuted(false);
      setError(null);
    }
  }, []);

  const startMic = useCallback(async () => {
    // Stop existing stream first
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      streamRef.current = stream;
      setMicStream(stream);
      setIsMuted(false);
      setError(null);
      console.log("[Microphone] Mic stream acquired, tracks:", stream.getAudioTracks().map(t => `${t.id}:${t.readyState}`));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to access microphone";
      setError(message);
      console.error("Microphone error:", err);
    }
  }, []);

  const toggleMute = useCallback(() => {
    if (streamRef.current) {
      const audioTracks = streamRef.current.getAudioTracks();
      const newMuted = !isMuted;
      audioTracks.forEach((track) => {
        track.enabled = !newMuted;
      });
      setIsMuted(newMuted);
    }
  }, [isMuted]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return { micStream, isMuted, toggleMute, startMic, stopMic, error };
}
