"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePartySocket } from "./usePartySocket";
import { usePartyClock } from "./usePartyClock";
import type { ChatMessage, ClientMessage, ParticipantStatus, RoomState, ServerMessage, VideoState } from "~/types/room";

interface UseRoomStateParams {
  roomCode: string;
  playerName: string;
  onRawMessage?: (msg: ServerMessage) => void;
}

export interface Reaction {
  id: string;
  from: string;
  fromName: string;
  emoji: string;
  timestamp: number;
  left: number; // random horizontal position (0-100%), set once at creation
}

export interface FloatingChatMessage extends ChatMessage {
  id: string;
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
  sendChat: (text: string) => void;
  sendStatusUpdate: (status: { isMuted: boolean; isSharingAudio: boolean; currentSong: string | null; browser?: string; lkIdentity?: string }) => void;
  sendReaction: (emoji: string) => void;
  sendMuteAll: () => void;
  sendUnmuteAll: () => void;
  sendMixAdjust: (voice: number) => void;
  clearPendingMixAdjust: () => void;
  sendVideoLoad: (videoId: string) => void;
  sendVideoSync: (playing: boolean, videoTime: number) => void;
  videoRef: React.RefObject<VideoState | null>;
  serverOffsetRef: React.RefObject<number>;
  clockSyncedRef: React.RefObject<boolean>;
  mutedBySinger: string | null;
  pendingMixAdjust: { fromName: string; voice: number } | null;
  nameTaken: { name: string; suggestions: string[] } | null;
  clearNameTaken: () => void;
  chatMessages: ChatMessage[];
  floatingChatMessages: FloatingChatMessage[];
  participantStatus: Record<string, ParticipantStatus>;
  reactions: Reaction[];
  kicked: string | null;
  authRequired: boolean;
  authFailed: boolean;
  sendKick: (peerId: string) => void;
  sendTransferAdmin: (peerId: string) => void;
  sendSetPassword: (password: string | null) => void;
  sendAuth: (password: string) => void;
}

const INITIAL_ROOM_STATE: RoomState = {
  participants: [],
  queue: [],
  currentSingerId: null,
  chatMessages: [],
  participantStatus: {},
  mutedBySinger: null,
  adminPeerId: null,
  isLocked: false,
  video: null,
};

export function useRoomState({
  roomCode,
  playerName,
  onRawMessage,
}: UseRoomStateParams): UseRoomStateReturn {
  const [roomState, setRoomState] = useState<RoomState>(INITIAL_ROOM_STATE);
  const [myPeerId, setMyPeerId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [floatingChatMessages, setFloatingChatMessages] = useState<FloatingChatMessage[]>([]);
  const [participantStatus, setParticipantStatus] = useState<Record<string, ParticipantStatus>>({});
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [mutedBySinger, setMutedBySinger] = useState<string | null>(null);
  const [pendingMixAdjust, setPendingMixAdjust] = useState<{ fromName: string; voice: number } | null>(null);
  const [nameTaken, setNameTaken] = useState<{ name: string; suggestions: string[] } | null>(null);
  const [kicked, setKicked] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [authFailed, setAuthFailed] = useState(false);
  const reactionIdRef = useRef(0);
  const floatingChatIdRef = useRef(0);
  const hasSentJoinRef = useRef(false);
  const onRawMessageRef = useRef(onRawMessage);

  useEffect(() => {
    onRawMessageRef.current = onRawMessage;
  }, [onRawMessage]);

  const hasReceivedInitialStateRef = useRef(false);
  const sendRef = useRef<((msg: ClientMessage) => void) | null>(null);
  const handleTimeSyncRef = useRef<(t0: number, t1: number) => void>(() => {});

  // Timing fields land in a ref only: video-state arrives every ~2s and the drift
  // loop reads it there, so only identity changes are worth a re-render.
  const videoRef = useRef<VideoState | null>(null);
  const applyVideoState = useCallback((video: VideoState | null) => {
    const previous = videoRef.current;
    videoRef.current = video;
    const changed = (previous === null) !== (video === null)
      || previous?.videoId !== video?.videoId
      || previous?.playing !== video?.playing
      || previous?.loadedAt !== video?.loadedAt;
    if (changed) setRoomState((prev) => ({ ...prev, video }));
  }, []);

  const onMessage = useCallback((msg: ServerMessage) => {
    onRawMessageRef.current?.(msg);

    switch (msg.type) {
      case "ping":
        sendRef.current?.({ type: "pong" });
        return;
      case "room-state": {
        // Defensive defaults for fields that may be missing from older PartyKit servers
        const state = {
          ...msg.state,
          chatMessages: msg.state.chatMessages ?? [],
          participantStatus: msg.state.participantStatus ?? {},
          queue: msg.state.queue ?? [],
          participants: msg.state.participants ?? [],
          adminPeerId: msg.state.adminPeerId ?? null,
          isLocked: msg.state.isLocked ?? false,
          video: msg.state.video ?? null,
        };
        setRoomState(state);
        videoRef.current = state.video;
        // Sync mutedBySinger from server state (persisted across reconnects)
        setMutedBySinger(state.mutedBySinger ?? null);
        setParticipantStatus(state.participantStatus);
        // Only sync chat from room-state on first load (catch-up).
        // After that, chat arrives via individual "chat" events.
        if (!hasReceivedInitialStateRef.current) {
          setChatMessages(state.chatMessages);
          hasReceivedInitialStateRef.current = true;
        }
        break;
      }
      case "participant-status":
        setParticipantStatus((prev) => ({
          ...prev,
          [msg.peerId]: msg.status,
        }));
        break;
      case "peer-left":
        setParticipantStatus((prev) => {
          const next = { ...prev };
          delete next[msg.peerId];
          return next;
        });
        break;
      case "chat": {
        const chatMessage = { from: msg.from, fromName: msg.fromName, text: msg.text, timestamp: msg.timestamp };
        setChatMessages((prev) => {
          const updated = [...prev, chatMessage];
          if (updated.length > 100) {
            return updated.slice(-100);
          }
          return updated;
        });
        if (msg.from !== "system") {
          const floatingId = `chat-${++floatingChatIdRef.current}`;
          setFloatingChatMessages((prev) => [...prev, { ...chatMessage, id: floatingId }].slice(-3));
          setTimeout(() => {
            setFloatingChatMessages((prev) => prev.filter((message) => message.id !== floatingId));
          }, 4000);
        }
        break;
      }
      case "reaction": {
        const reactionId = `r-${++reactionIdRef.current}`;
        setReactions((prev) => {
          const left = Math.random() * 80 + 10; // 10-90%
          const next = [...prev, { id: reactionId, from: msg.from, fromName: msg.fromName, emoji: msg.emoji, timestamp: Date.now(), left }];
          return next.length > 20 ? next.slice(-20) : next;
        });
        // Remove this specific reaction by ID after 3 seconds
        setTimeout(() => {
          setReactions((prev) => prev.filter((r) => r.id !== reactionId));
        }, 3000);
        break;
      }
      case "mute-all":
        setMutedBySinger(msg.singerName);
        break;
      case "unmute-all":
        setMutedBySinger(null);
        break;
      case "mix-adjust":
        setPendingMixAdjust({ fromName: msg.fromName, voice: msg.voice });
        break;
      case "video-state":
        applyVideoState(msg.video);
        break;
      case "time-sync":
        handleTimeSyncRef.current(msg.t0, msg.t1);
        break;
      case "name-taken":
        console.log("[RoomState] Name taken:", msg.name, "suggestions:", msg.suggestions);
        setNameTaken({ name: msg.name, suggestions: msg.suggestions });
        break;
      case "you-joined":
        console.log("[RoomState] My peer ID:", msg.peerId);
        setMyPeerId(msg.peerId);
        break;
      case "kicked":
        console.log("[RoomState] Kicked by:", msg.by);
        setKicked(msg.by);
        break;
      case "auth-required":
        console.log("[RoomState] Auth required for room");
        setAuthRequired(true);
        setAuthFailed(false);
        break;
      case "auth-failed":
        console.log("[RoomState] Auth failed");
        setAuthFailed(true);
        break;
      case "admin-changed":
        console.log("[RoomState] Admin changed to:", msg.name);
        setRoomState((prev) => ({ ...prev, adminPeerId: msg.peerId }));
        break;
      case "error":
        console.error("[RoomState] Server error:", msg.message);
        break;
      default:
        break;
    }
  }, [applyVideoState]);

  const { send, isConnected } = usePartySocket({ roomCode, onMessage });
  sendRef.current = send;

  const { serverOffsetRef, clockSyncedRef, handleTimeSync } = usePartyClock(sendRef, isConnected);
  handleTimeSyncRef.current = handleTimeSync;

  // Send join message on connect and on name change
  const prevNameRef = useRef(playerName);
  useEffect(() => {
    if (!isConnected) return;
    // Send join on first connect or when name changes
    if (!hasSentJoinRef.current || prevNameRef.current !== playerName) {
      send({ type: "join", name: playerName });
      hasSentJoinRef.current = true;
      prevNameRef.current = playerName;
    }
  }, [isConnected, playerName, send]);

  // Reset flags if disconnected
  useEffect(() => {
    if (!isConnected) {
      hasSentJoinRef.current = false;
      hasReceivedInitialStateRef.current = false;
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

  const sendChat = useCallback((text: string) => {
    if (text.trim()) {
      send({ type: "chat", text });
    }
  }, [send]);

  const sendStatusUpdate = useCallback((status: { isMuted: boolean; isSharingAudio: boolean; currentSong: string | null; browser?: string; lkIdentity?: string }) => {
    send({
      type: "status-update",
      isMuted: status.isMuted,
      isSharingAudio: status.isSharingAudio,
      currentSong: status.currentSong,
      browser: status.browser,
      lkIdentity: status.lkIdentity,
    });
  }, [send]);

  const sendReaction = useCallback((emoji: string) => {
    send({ type: "reaction", emoji });
  }, [send]);

  const sendMuteAll = useCallback(() => {
    send({ type: "mute-all" });
  }, [send]);

  const sendUnmuteAll = useCallback(() => {
    send({ type: "unmute-all" });
  }, [send]);

  const sendMixAdjust = useCallback((voice: number) => {
    send({ type: "mix-adjust", voice });
  }, [send]);

  const clearPendingMixAdjust = useCallback(() => {
    setPendingMixAdjust(null);
  }, []);

  const sendVideoLoad = useCallback((videoId: string) => {
    send({ type: "video-load", videoId });
  }, [send]);

  const sendVideoSync = useCallback((playing: boolean, videoTime: number) => {
    send({ type: "video-sync", playing, videoTime, videoId: videoRef.current?.videoId });
  }, [send]);

  const clearNameTaken = useCallback(() => {
    setNameTaken(null);
  }, []);

  const sendKick = useCallback((peerId: string) => {
    send({ type: "kick", peerId });
  }, [send]);

  const sendTransferAdmin = useCallback((peerId: string) => {
    send({ type: "transfer-admin", peerId });
  }, [send]);

  const sendSetPassword = useCallback((password: string | null) => {
    send({ type: "set-password", password });
  }, [send]);

  const sendAuth = useCallback((password: string) => {
    send({ type: "auth", password });
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
    sendChat,
    sendStatusUpdate,
    sendReaction,
    sendMuteAll,
    sendUnmuteAll,
    sendMixAdjust,
    clearPendingMixAdjust,
    sendVideoLoad,
    sendVideoSync,
    videoRef,
    serverOffsetRef,
    clockSyncedRef,
    mutedBySinger,
    pendingMixAdjust,
    nameTaken,
    clearNameTaken,
    chatMessages,
    floatingChatMessages,
    participantStatus,
    reactions,
    kicked,
    authRequired,
    authFailed,
    sendKick,
    sendTransferAdmin,
    sendSetPassword,
    sendAuth,
  };
}
