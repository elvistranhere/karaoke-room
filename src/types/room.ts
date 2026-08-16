// Re-export of the shared protocol. The schemas and types live in
// src/shared/protocol.ts; nothing is declared here.
export type {
  ChatMessage,
  ClientMessage,
  Participant,
  ParticipantStatus,
  PublicRoomEntry,
  RoomState,
  ServerMessage,
  VideoState,
} from "~/shared/protocol";
