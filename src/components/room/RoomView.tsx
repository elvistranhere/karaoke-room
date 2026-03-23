"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRoomState } from "~/hooks/useRoomState";
import { useMicrophone } from "~/hooks/useMicrophone";
import { useSystemAudio } from "~/hooks/useSystemAudio";
import { useWebRTC } from "~/hooks/useWebRTC";
import type { ServerMessage } from "~/types/room";
import { QueuePanel } from "./QueuePanel";
import { AudioControls } from "./AudioControls";
import { ParticipantList } from "./ParticipantList";
import { NowSinging } from "./NowSinging";
import { InviteCode } from "./InviteCode";

interface RoomViewProps {
  roomCode: string;
  playerName: string;
}

export function RoomView({ roomCode, playerName }: RoomViewProps) {
  const {
    micStream,
    isMuted,
    toggleMute,
    startMic,
    stopMic,
    error: micError,
  } = useMicrophone();

  const {
    systemAudioTrack,
    isSharing,
    startSharing,
    stopSharing,
    error: audioError,
  } = useSystemAudio();

  // We need to wire useWebRTC before useRoomState so we can pass handleServerMessage
  // But useWebRTC needs myPeerId and send from useRoomState...
  // Solution: use refs to break the circular dependency.

  const webrtcRef = useRef<{
    handleServerMessage: (msg: ServerMessage) => void;
  }>({ handleServerMessage: () => {} });

  const onRawMessage = useCallback((msg: ServerMessage) => {
    webrtcRef.current.handleServerMessage(msg);
  }, []);

  const {
    roomState,
    myPeerId,
    isConnected,
    joinQueue,
    leaveQueue,
    finishSinging,
    isMyTurn,
    send,
  } = useRoomState({ roomCode, playerName, onRawMessage });

  const { remoteStreams, handleServerMessage, peerCount } = useWebRTC({
    myPeerId,
    send,
    micStream,
    systemAudioTrack,
    isMyTurn,
  });

  // Keep the ref up to date
  useEffect(() => {
    webrtcRef.current.handleServerMessage = handleServerMessage;
  }, [handleServerMessage]);

  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden">
      {/* Background */}
      <div
        className="pointer-events-none fixed inset-0 opacity-10"
        style={{
          background:
            "radial-gradient(ellipse at 20% 50%, var(--color-neon-pink), transparent 50%), radial-gradient(ellipse at 80% 50%, var(--color-neon-cyan), transparent 50%)",
        }}
      />

      {/* Header */}
      <header
        className="relative z-10 flex items-center justify-between border-b px-6 py-4"
        style={{ borderColor: "var(--color-dark-border)" }}
      >
        <div className="flex items-center gap-4">
          <h1
            className="text-2xl font-bold"
            style={{
              fontFamily: "var(--font-display)",
              background:
                "linear-gradient(135deg, var(--color-neon-pink), var(--color-neon-cyan))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            KaraOK
          </h1>
          <InviteCode code={roomCode} />
        </div>

        <div className="flex items-center gap-3">
          <div
            className="flex items-center gap-2 text-sm"
            style={{ color: "var(--color-text-secondary)" }}
          >
            <div
              className="h-2 w-2 rounded-full"
              style={{
                background: isConnected
                  ? "var(--color-neon-cyan)"
                  : "var(--color-neon-pink)",
                boxShadow: isConnected
                  ? "0 0 8px var(--color-neon-cyan)"
                  : "0 0 8px var(--color-neon-pink)",
              }}
            />
            {isConnected ? "Connected" : "Connecting..."}
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="relative z-10 flex flex-1 flex-col gap-6 p-6 lg:flex-row">
        {/* Left: Stage area */}
        <div className="flex flex-1 flex-col gap-6">
          <NowSinging
            roomState={roomState}
            isMyTurn={isMyTurn}
            myPeerId={myPeerId}
            isSharing={isSharing}
            onStartSharing={startSharing}
            onStopSharing={stopSharing}
            onFinishSinging={finishSinging}
            audioError={audioError}
          />

          <AudioControls
            isMuted={isMuted}
            toggleMute={toggleMute}
            startMic={startMic}
            stopMic={stopMic}
            micStream={micStream}
            micError={micError}
          />
        </div>

        {/* Right: Sidebar */}
        <div className="flex w-full flex-col gap-6 lg:w-80">
          <QueuePanel
            roomState={roomState}
            myPeerId={myPeerId}
            onJoinQueue={joinQueue}
            onLeaveQueue={leaveQueue}
          />
          <ParticipantList
            participants={roomState.participants}
            currentSingerId={roomState.currentSingerId}
            myPeerId={myPeerId}
          />
        </div>
      </div>

      {/* Remote audio elements (hidden) */}
      {Array.from(remoteStreams).map(([peerId, stream]) => (
        <RemoteAudio key={peerId} stream={stream} />
      ))}
    </main>
  );
}

function RemoteAudio({ stream }: { stream: MediaStream }) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.srcObject = stream;
    // Force play to handle autoplay policy
    const playPromise = audio.play();
    if (playPromise) {
      playPromise.catch((err) => {
        console.warn("Autoplay blocked for remote audio, retrying on user interaction:", err);
        // Retry on next user click
        const retry = () => {
          audio.play().catch(() => {});
          document.removeEventListener("click", retry);
        };
        document.addEventListener("click", retry);
      });
    }

    return () => {
      audio.srcObject = null;
    };
  }, [stream]);

  return <audio ref={audioRef} autoPlay playsInline className="hidden" />;
}
