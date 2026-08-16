// Types shared between PartyKit server and client
// Keep in sync with src/types/room.ts

export interface Participant {
  id: string;
  name: string;
}

export interface ChatMessage {
  from: string;
  fromName: string;
  text: string;
  timestamp: number;
}

export interface ParticipantStatus {
  isMuted: boolean;
  isSharingAudio: boolean;
  currentSong: string | null;
  browser?: string;
  lkIdentity?: string;
  isDeafened?: boolean;
}

// wallTime is stamped by the server clock on receipt, never by the singer.
export interface VideoState {
  videoId: string;
  playing: boolean;
  videoTime: number;
  wallTime: number;
  loadedAt: number;
  singerId: string;
}

export interface RoomState {
  participants: Participant[];
  queue: string[];
  currentSingerId: string | null;
  chatMessages: ChatMessage[];
  participantStatus: Record<string, ParticipantStatus>;
  mutedBySinger: string | null;
  adminPeerId: string | null;
  isLocked: boolean;
  video: VideoState | null;
  roomName: string | null;
  isPublic: boolean;
  // Room-scoped feature flags, seeded from the FEATURE_FLAGS env var
  flags: Record<string, boolean>;
}

// Shape returned by GET /parties/registry/global. `name` is optional because
// entries written by a pre-rename server do not carry it.
export interface PublicRoomEntry {
  code: string;
  name?: string | null;
  participantCount: number;
  currentSinger: string | null;
  currentSong: string | null;
  isLocked: boolean;
  updatedAt: number;
}

// Client -> Server
export type ClientMessage =
  | { type: "join"; name: string; clientId?: string }
  | { type: "join-queue" }
  | { type: "leave-queue" }
  | { type: "finish-singing" }
  | { type: "chat"; text: string }
  | { type: "status-update"; isMuted: boolean; isSharingAudio: boolean; currentSong: string | null; browser?: string; lkIdentity?: string; isDeafened?: boolean }
  | { type: "reaction"; emoji: string }
  | { type: "mute-all" }
  | { type: "unmute-all" }
  | { type: "mix-adjust"; voice: number; music?: number }
  | { type: "video-load"; videoId: string }
  // stalled: the singer is rebuffering, so this only re-arms the server stall timer
  | { type: "video-sync"; playing: boolean; videoTime: number; videoId?: string; stalled?: boolean }
  | { type: "time-sync"; t0: number }
  | { type: "kick"; peerId: string }
  | { type: "set-password"; password: string | null }
  | { type: "transfer-admin"; peerId: string }
  | { type: "auth"; password: string }
  | { type: "set-room-name"; name: string | null }
  | { type: "set-public"; isPublic: boolean }
  | { type: "remove-from-queue"; peerId: string }
  | { type: "skip-singer" }
  | { type: "pong" };

// Server -> Client
export type ServerMessage =
  | { type: "room-state"; state: RoomState }
  | { type: "peer-joined"; peerId: string; name: string }
  | { type: "peer-left"; peerId: string }
  | { type: "you-joined"; peerId: string }
  | { type: "error"; message: string }
  | { type: "chat"; from: string; fromName: string; text: string; timestamp: number }
  | { type: "participant-status"; peerId: string; status: ParticipantStatus }
  | { type: "reaction"; from: string; fromName: string; emoji: string }
  | { type: "mute-all"; singerName: string }
  | { type: "unmute-all" }
  | { type: "mix-adjust"; fromName: string; voice: number; music: number }
  | { type: "video-state"; video: VideoState | null }
  | { type: "time-sync"; t0: number; t1: number }
  | { type: "name-taken"; name: string; suggestions: string[] }
  | { type: "kicked"; by: string }
  | { type: "auth-required" }
  | { type: "auth-failed" }
  | { type: "admin-changed"; peerId: string; name: string }
  | { type: "ping" };
