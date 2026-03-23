"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseSystemAudioReturn {
  systemAudioTrack: MediaStreamTrack | null;
  isSharing: boolean;
  startSharing: () => Promise<void>;
  stopSharing: () => void;
  error: string | null;
}

export function useSystemAudio(): UseSystemAudioReturn {
  const [systemAudioTrack, setSystemAudioTrack] =
    useState<MediaStreamTrack | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);

  const stopSharing = useCallback(() => {
    if (trackRef.current) {
      trackRef.current.stop();
      trackRef.current = null;
      setSystemAudioTrack(null);
      setIsSharing(false);
      setError(null);
    }
  }, []);

  const startSharing = useCallback(async () => {
    // Stop existing sharing first
    if (trackRef.current) {
      trackRef.current.stop();
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: 1,
          height: 1,
          frameRate: 1,
        },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 48000,
        },
      });

      // Immediately stop the video track -- we only want audio
      stream.getVideoTracks().forEach((track) => track.stop());

      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) {
        setError(
          "No audio track captured. Make sure to share a tab with audio.",
        );
        return;
      }

      // Listen for user stopping sharing via browser UI
      audioTrack.onended = () => {
        trackRef.current = null;
        setSystemAudioTrack(null);
        setIsSharing(false);
      };

      trackRef.current = audioTrack;
      setSystemAudioTrack(audioTrack);
      setIsSharing(true);
      setError(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to capture system audio";
      setError(message);
      console.error("System audio capture error:", err);
    }
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (trackRef.current) {
        trackRef.current.stop();
      }
    };
  }, []);

  return { systemAudioTrack, isSharing, startSharing, stopSharing, error };
}
