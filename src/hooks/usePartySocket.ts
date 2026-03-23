"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import PartySocket from "partysocket";
import type { ClientMessage, ServerMessage } from "~/types/room";

interface UsePartySocketParams {
  roomCode: string;
  onMessage: (msg: ServerMessage) => void;
}

interface UsePartySocketReturn {
  send: (msg: ClientMessage) => void;
  isConnected: boolean;
  socket: PartySocket | null;
}

export function usePartySocket({
  roomCode,
  onMessage,
}: UsePartySocketParams): UsePartySocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<PartySocket | null>(null);
  const onMessageRef = useRef(onMessage);

  // Keep callback ref up to date without triggering reconnects
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    const host =
      process.env.NEXT_PUBLIC_PARTY_HOST ?? "localhost:1999";

    const socket = new PartySocket({
      host,
      room: roomCode,
      party: "main",
    });

    socketRef.current = socket;

    socket.addEventListener("open", () => {
      setIsConnected(true);
    });

    socket.addEventListener("close", () => {
      setIsConnected(false);
    });

    socket.addEventListener("message", (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as ServerMessage;
        onMessageRef.current(msg);
      } catch {
        console.error("Failed to parse server message:", event.data);
      }
    });

    return () => {
      socket.close();
      socketRef.current = null;
      setIsConnected(false);
    };
  }, [roomCode]);

  const send = useCallback((msg: ClientMessage) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg));
    }
  }, []);

  return { send, isConnected, socket: socketRef.current };
}
