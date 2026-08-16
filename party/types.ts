// Re-export of the shared protocol. The schemas and types live in
// src/shared/protocol.ts; nothing is declared here.
export {
  chatMessageSchema,
  clientMessageSchema,
  participantSchema,
  participantStatusSchema,
  publicRoomEntrySchema,
  roomStateSchema,
  serverMessageSchema,
  videoStateSchema,
} from "../src/shared/protocol";
export type {
  ChatMessage,
  ClientMessage,
  Participant,
  ParticipantStatus,
  PublicRoomEntry,
  RoomState,
  ServerMessage,
  VideoState,
} from "../src/shared/protocol";
