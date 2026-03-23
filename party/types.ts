// Types shared between PartyKit server and client
// Keep in sync with src/types/room.ts

export interface Participant {
  id: string;
  name: string;
}

export interface RoomState {
  participants: Participant[];
  queue: string[];
  currentSingerId: string | null;
}

// Client -> Server
export type ClientMessage =
  | { type: "join"; name: string }
  | { type: "join-queue" }
  | { type: "leave-queue" }
  | { type: "finish-singing" }
  | { type: "signal"; to: string; payload: SignalPayload };

// Server -> Client
export type ServerMessage =
  | { type: "room-state"; state: RoomState }
  | { type: "signal"; from: string; payload: SignalPayload }
  | { type: "peer-joined"; peerId: string; name: string }
  | { type: "peer-left"; peerId: string }
  | { type: "you-joined"; peerId: string }
  | { type: "error"; message: string };

export type SignalPayload =
  | { kind: "offer"; sdp: string }
  | { kind: "answer"; sdp: string }
  | { kind: "ice-candidate"; candidate: RTCIceCandidateInit };
