"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePartySocket } from "./usePartySocket";
import type { ClientMessage, RoomState, ServerMessage } from "~/types/room";

interface UseRoomStateParams {
  roomCode: string;
  playerName: string;
  onRawMessage?: (msg: ServerMessage) => void;
}

interface UseRoomStateReturn {
  roomState: RoomState;
  myPeerId: string | null;
  isConnected: boolean;
  joinQueue: () => void;
  leaveQueue: () => void;
  finishSinging: () => void;
  isMyTurn: boolean;
  send: (msg: ClientMessage) => void;
}

const INITIAL_ROOM_STATE: RoomState = {
  participants: [],
  queue: [],
  currentSingerId: null,
};

export function useRoomState({
  roomCode,
  playerName,
  onRawMessage,
}: UseRoomStateParams): UseRoomStateReturn {
  const [roomState, setRoomState] = useState<RoomState>(INITIAL_ROOM_STATE);
  const [myPeerId, setMyPeerId] = useState<string | null>(null);
  const hasSentJoinRef = useRef(false);
  const onRawMessageRef = useRef(onRawMessage);

  useEffect(() => {
    onRawMessageRef.current = onRawMessage;
  }, [onRawMessage]);

  const onMessage = useCallback((msg: ServerMessage) => {
    console.log("[RoomState] Received message:", msg.type);
    // Forward all messages to the raw handler (for useWebRTC)
    onRawMessageRef.current?.(msg);

    switch (msg.type) {
      case "room-state":
        setRoomState(msg.state);
        break;
      case "you-joined":
        console.log("[RoomState] My peer ID:", msg.peerId);
        setMyPeerId(msg.peerId);
        break;
      case "error":
        console.error("[RoomState] Server error:", msg.message);
        break;
      // peer-joined, peer-left, signal are forwarded via onRawMessage
      default:
        break;
    }
  }, []);

  const { send, isConnected } = usePartySocket({ roomCode, onMessage });

  // Send join message once connected
  useEffect(() => {
    if (isConnected && !hasSentJoinRef.current) {
      send({ type: "join", name: playerName });
      hasSentJoinRef.current = true;
    }
  }, [isConnected, playerName, send]);

  // Reset join flag if disconnected
  useEffect(() => {
    if (!isConnected) {
      hasSentJoinRef.current = false;
    }
  }, [isConnected]);

  const joinQueue = useCallback(() => {
    send({ type: "join-queue" });
  }, [send]);

  const leaveQueue = useCallback(() => {
    send({ type: "leave-queue" });
  }, [send]);

  const finishSinging = useCallback(() => {
    send({ type: "finish-singing" });
  }, [send]);

  const isMyTurn = myPeerId !== null && roomState.currentSingerId === myPeerId;

  return {
    roomState,
    myPeerId,
    isConnected,
    joinQueue,
    leaveQueue,
    finishSinging,
    isMyTurn,
    send,
  };
}
