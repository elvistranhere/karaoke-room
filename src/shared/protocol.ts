import { z } from "zod";

// Single source of truth for the PartyKit wire protocol. The server imports it with a
// relative path (partykit's bundler has no `~` alias); the client goes through `~/shared/protocol`.

export const participantSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const chatMessageSchema = z.object({
  from: z.string(),
  fromName: z.string(),
  text: z.string(),
  timestamp: z.number(),
});

export const participantStatusSchema = z.object({
  isMuted: z.boolean(),
  isSharingAudio: z.boolean(),
  currentSong: z.string().nullable(),
  browser: z.string().optional(),
  lkIdentity: z.string().optional(),
  isDeafened: z.boolean().optional(),
});

// wallTime is stamped by the server clock on receipt, never by the singer.
export const videoStateSchema = z.object({
  videoId: z.string(),
  playing: z.boolean(),
  videoTime: z.number(),
  wallTime: z.number(),
  loadedAt: z.number(),
  singerId: z.string(),
});

export const roomStateSchema = z.object({
  participants: z.array(participantSchema),
  queue: z.array(z.string()),
  currentSingerId: z.string().nullable(),
  chatMessages: z.array(chatMessageSchema),
  participantStatus: z.record(participantStatusSchema),
  mutedBySinger: z.string().nullable(),
  adminPeerId: z.string().nullable(),
  isLocked: z.boolean(),
  video: videoStateSchema.nullable(),
  roomName: z.string().nullable(),
  isPublic: z.boolean(),
  // Room-scoped feature flags, seeded from the FEATURE_FLAGS env var
  flags: z.record(z.boolean()),
});

// Shape returned by GET /parties/registry/global. `name` is optional because
// entries written by a pre-rename server do not carry it.
export const publicRoomEntrySchema = z.object({
  code: z.string(),
  name: z.string().nullable().optional(),
  participantCount: z.number(),
  currentSinger: z.string().nullable(),
  currentSong: z.string().nullable(),
  isLocked: z.boolean(),
  updatedAt: z.number(),
});

// Client -> Server. Structural only: the length caps, emoji allowlist and video id
// checks stay in the handlers, so a well-shaped but disallowed value keeps its own reply.
export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("join"), name: z.string(), clientId: z.string().optional() }),
  z.object({ type: z.literal("join-queue") }),
  z.object({ type: z.literal("leave-queue") }),
  z.object({ type: z.literal("finish-singing") }),
  z.object({ type: z.literal("chat"), text: z.string() }),
  z.object({
    type: z.literal("status-update"),
    isMuted: z.boolean(),
    isSharingAudio: z.boolean(),
    currentSong: z.string().nullable(),
    browser: z.string().optional(),
    lkIdentity: z.string().optional(),
    isDeafened: z.boolean().optional(),
  }),
  z.object({ type: z.literal("reaction"), emoji: z.string() }),
  z.object({ type: z.literal("mute-all") }),
  z.object({ type: z.literal("unmute-all") }),
  z.object({ type: z.literal("mix-adjust"), voice: z.number(), music: z.number().optional() }),
  z.object({ type: z.literal("video-load"), videoId: z.string() }),
  // stalled: the singer is rebuffering, so this only re-arms the server stall timer
  z.object({
    type: z.literal("video-sync"),
    playing: z.boolean(),
    videoTime: z.number(),
    videoId: z.string().optional(),
    stalled: z.boolean().optional(),
  }),
  z.object({ type: z.literal("time-sync"), t0: z.number() }),
  z.object({ type: z.literal("kick"), peerId: z.string() }),
  z.object({ type: z.literal("set-password"), password: z.string().nullable() }),
  z.object({ type: z.literal("transfer-admin"), peerId: z.string() }),
  z.object({ type: z.literal("auth"), password: z.string() }),
  z.object({ type: z.literal("set-room-name"), name: z.string().nullable() }),
  z.object({ type: z.literal("set-public"), isPublic: z.boolean() }),
  z.object({ type: z.literal("remove-from-queue"), peerId: z.string() }),
  z.object({ type: z.literal("skip-singer") }),
  z.object({ type: z.literal("pong") }),
]);

// Server -> Client
export const serverMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("room-state"), state: roomStateSchema }),
  z.object({ type: z.literal("peer-joined"), peerId: z.string(), name: z.string() }),
  z.object({ type: z.literal("peer-left"), peerId: z.string() }),
  z.object({ type: z.literal("you-joined"), peerId: z.string() }),
  z.object({ type: z.literal("error"), message: z.string() }),
  z.object({
    type: z.literal("chat"),
    from: z.string(),
    fromName: z.string(),
    text: z.string(),
    timestamp: z.number(),
  }),
  z.object({ type: z.literal("participant-status"), peerId: z.string(), status: participantStatusSchema }),
  z.object({ type: z.literal("reaction"), from: z.string(), fromName: z.string(), emoji: z.string() }),
  z.object({ type: z.literal("mute-all"), singerName: z.string() }),
  z.object({ type: z.literal("unmute-all") }),
  z.object({ type: z.literal("mix-adjust"), fromName: z.string(), voice: z.number(), music: z.number() }),
  z.object({ type: z.literal("video-state"), video: videoStateSchema.nullable() }),
  z.object({ type: z.literal("time-sync"), t0: z.number(), t1: z.number() }),
  z.object({ type: z.literal("name-taken"), name: z.string(), suggestions: z.array(z.string()) }),
  z.object({ type: z.literal("kicked"), by: z.string() }),
  z.object({ type: z.literal("auth-required") }),
  z.object({ type: z.literal("auth-failed") }),
  z.object({ type: z.literal("admin-changed"), peerId: z.string(), name: z.string() }),
  z.object({ type: z.literal("ping") }),
]);

export type Participant = z.infer<typeof participantSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ParticipantStatus = z.infer<typeof participantStatusSchema>;
export type VideoState = z.infer<typeof videoStateSchema>;
export type RoomState = z.infer<typeof roomStateSchema>;
export type PublicRoomEntry = z.infer<typeof publicRoomEntrySchema>;
export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type ServerMessage = z.infer<typeof serverMessageSchema>;
