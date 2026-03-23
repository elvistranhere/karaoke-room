"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteParticipant,
  ConnectionState,
  type RoomOptions,
  type LocalTrackPublication,
} from "livekit-client";

interface UseLiveKitParams {
  roomCode: string;
  playerName: string;
  isMyTurn: boolean;
}

interface UseLiveKitReturn {
  isConnected: boolean;
  error: string | null;
  isMicEnabled: boolean;
  toggleMic: () => Promise<void>;
  isSharing: boolean;
  startSharing: () => Promise<void>;
  stopSharing: () => void;
  sharingError: string | null;
  remoteParticipantCount: number;
}

export function useLiveKit({
  roomCode,
  playerName,
  isMyTurn,
}: UseLiveKitParams): UseLiveKitReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMicEnabled, setIsMicEnabled] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [sharingError, setSharingError] = useState<string | null>(null);
  const [remoteParticipantCount, setRemoteParticipantCount] = useState(0);

  const roomRef = useRef<Room | null>(null);
  const systemAudioTrackRef = useRef<MediaStreamTrack | null>(null);
  const systemAudioPubRef = useRef<LocalTrackPublication | null>(null);

  // --- Connect to LiveKit room ---

  useEffect(() => {
    if (!roomCode || !playerName) return;

    let cancelled = false;

    const room = new Room({
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      adaptiveStream: true,
      dynacast: true,
    });

    roomRef.current = room;

    // Remote audio: auto-attach
    room.on(
      RoomEvent.TrackSubscribed,
      (
        track: RemoteTrack,
        _pub: RemoteTrackPublication,
        participant: RemoteParticipant,
      ) => {
        if (track.kind !== Track.Kind.Audio) return;
        console.log("[LiveKit] Subscribed to audio from", participant.identity, "source:", track.source);
        const el = track.attach();
        el.id = `lk-audio-${participant.identity}-${track.sid}`;
        el.style.display = "none";
        document.body.appendChild(el);
      },
    );

    room.on(
      RoomEvent.TrackUnsubscribed,
      (
        track: RemoteTrack,
        _pub: RemoteTrackPublication,
        participant: RemoteParticipant,
      ) => {
        if (track.kind !== Track.Kind.Audio) return;
        console.log("[LiveKit] Unsubscribed audio from", participant.identity);
        for (const el of track.detach()) {
          el.remove();
        }
      },
    );

    // Participant count
    const updateCount = () => {
      if (cancelled) return;
      setRemoteParticipantCount(room.remoteParticipants.size);
    };
    room.on(RoomEvent.ParticipantConnected, updateCount);
    room.on(RoomEvent.ParticipantDisconnected, updateCount);

    // Connection state
    room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
      console.log("[LiveKit] Connection state:", state);
      if (cancelled) return;
      setIsConnected(state === ConnectionState.Connected);
    });

    room.on(RoomEvent.Disconnected, () => {
      console.log("[LiveKit] Disconnected");
      if (!cancelled) {
        setIsConnected(false);
      }
    });

    // Connect
    const connect = async () => {
      try {
        const res = await fetch(
          `/api/livekit-token?room=${encodeURIComponent(roomCode)}&name=${encodeURIComponent(playerName)}`,
        );
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Token error: ${res.status} ${text}`);
        }
        const { token } = (await res.json()) as { token: string };
        if (cancelled) return;

        const url = process.env.NEXT_PUBLIC_LIVEKIT_URL;
        if (!url) throw new Error("NEXT_PUBLIC_LIVEKIT_URL not set");

        console.log("[LiveKit] Connecting to", url);
        await room.connect(url, token);
        if (cancelled) return;

        console.log("[LiveKit] Connected! Local participant:", room.localParticipant.identity);
        setIsConnected(true);
        setError(null);
        updateCount();
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Connection failed";
        console.error("[LiveKit] Error:", err);
        setError(msg);
      }
    };

    void connect();

    return () => {
      cancelled = true;
      // Stop system audio
      if (systemAudioTrackRef.current) {
        systemAudioTrackRef.current.stop();
        systemAudioTrackRef.current = null;
      }
      systemAudioPubRef.current = null;
      room.disconnect();
      roomRef.current = null;
      setIsConnected(false);
      setIsMicEnabled(false);
      setIsSharing(false);
    };
  }, [roomCode, playerName]);

  // --- Microphone ---

  const toggleMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room || !room.localParticipant) return;

    try {
      const newState = !isMicEnabled;
      console.log("[LiveKit] Setting mic enabled:", newState);
      await room.localParticipant.setMicrophoneEnabled(newState);
      setIsMicEnabled(newState);
      console.log("[LiveKit] Mic is now", newState ? "ON" : "OFF");
    } catch (err) {
      console.error("[LiveKit] Mic error:", err);
      setError(err instanceof Error ? err.message : "Mic failed");
    }
  }, [isMicEnabled]);

  // --- System audio sharing ---

  const startSharing = useCallback(async () => {
    const room = roomRef.current;
    if (!room || !room.localParticipant) {
      setSharingError("Not connected");
      return;
    }

    try {
      console.log("[LiveKit] Capturing system audio...");
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: 1, height: 1, frameRate: 1 },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      // Kill video track immediately
      for (const vt of stream.getVideoTracks()) vt.stop();

      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) {
        setSharingError("No audio captured. Check 'Share audio' in the dialog.");
        return;
      }

      console.log("[LiveKit] Got system audio track, publishing...");

      // Publish to LiveKit
      const pub = await room.localParticipant.publishTrack(audioTrack, {
        source: Track.Source.ScreenShareAudio,
        name: "karaoke-audio",
      });

      console.log("[LiveKit] System audio published!", pub.trackSid);

      systemAudioTrackRef.current = audioTrack;
      systemAudioPubRef.current = pub;
      setIsSharing(true);
      setSharingError(null);

      // Handle user stopping share via browser UI
      audioTrack.onended = () => {
        console.log("[LiveKit] System audio ended by user");
        // Unpublish from LiveKit
        if (roomRef.current?.localParticipant && pub.track) {
          void roomRef.current.localParticipant.unpublishTrack(pub.track);
        }
        systemAudioTrackRef.current = null;
        systemAudioPubRef.current = null;
        setIsSharing(false);
      };
    } catch (err) {
      if (err instanceof Error && err.name === "NotAllowedError") {
        setSharingError(null); // User cancelled the dialog
      } else {
        const msg = err instanceof Error ? err.message : "Failed to share audio";
        console.error("[LiveKit] Share error:", err);
        setSharingError(msg);
      }
    }
  }, []);

  const stopSharing = useCallback(() => {
    const room = roomRef.current;
    const track = systemAudioTrackRef.current;
    const pub = systemAudioPubRef.current;

    console.log("[LiveKit] Stopping sharing. track:", !!track, "pub:", !!pub);

    if (pub?.track && room?.localParticipant) {
      void room.localParticipant.unpublishTrack(pub.track);
    }

    if (track) {
      track.stop();
    }

    systemAudioTrackRef.current = null;
    systemAudioPubRef.current = null;
    setIsSharing(false);
    setSharingError(null);
  }, []);

  // Auto-stop sharing when not my turn
  useEffect(() => {
    if (!isMyTurn && isSharing) {
      console.log("[LiveKit] Not my turn — stopping share");
      stopSharing();
    }
  }, [isMyTurn, isSharing, stopSharing]);

  return {
    isConnected,
    error,
    isMicEnabled,
    toggleMic,
    isSharing,
    startSharing,
    stopSharing,
    sharingError,
    remoteParticipantCount,
  };
}
