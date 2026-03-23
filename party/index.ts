import type * as Party from "partykit/server";
import type { ClientMessage, RoomState, ServerMessage, SignalPayload } from "./types";

interface ParticipantEntry {
  name: string;
  ws: Party.Connection;
}

export default class KaraokeRoom implements Party.Server {
  participants: Map<string, ParticipantEntry> = new Map();
  queue: string[] = [];
  currentSingerId: string | null = null;

  constructor(readonly room: Party.Room) {}

  onConnect(conn: Party.Connection) {
    // Send the new connection its peer ID immediately.
    // The client must follow up with a "join" message to register a name.
    this.send(conn, { type: "you-joined", peerId: conn.id });
  }

  onMessage(message: string | ArrayBuffer | ArrayBufferView, sender: Party.Connection) {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(message as string) as ClientMessage;
    } catch {
      this.send(sender, { type: "error", message: "Invalid JSON" });
      return;
    }

    switch (msg.type) {
      case "join":
        this.handleJoin(sender, msg.name);
        break;
      case "join-queue":
        this.handleJoinQueue(sender);
        break;
      case "leave-queue":
        this.handleLeaveQueue(sender);
        break;
      case "finish-singing":
        this.handleFinishSinging(sender);
        break;
      case "signal":
        this.handleSignal(sender, msg.to, msg.payload);
        break;
      default:
        this.send(sender, { type: "error", message: "Unknown message type" });
    }
  }

  onClose(conn: Party.Connection) {
    const participant = this.participants.get(conn.id);
    if (!participant) return;

    this.participants.delete(conn.id);

    // Remove from queue
    this.queue = this.queue.filter((id) => id !== conn.id);

    // If they were the current singer, promote next
    if (this.currentSingerId === conn.id) {
      this.currentSingerId = null;
      this.promoteNextSinger();
    }

    this.broadcast({ type: "peer-left", peerId: conn.id });
    this.broadcastState();
  }

  // ── Handlers ────────────────────────────────────────────────

  private handleJoin(sender: Party.Connection, name: string) {
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      this.send(sender, { type: "error", message: "Name is required" });
      return;
    }

    const trimmedName = name.trim();

    // Handle re-join: update name if already present
    const existing = this.participants.get(sender.id);
    if (existing) {
      existing.name = trimmedName;
    } else {
      this.participants.set(sender.id, { name: trimmedName, ws: sender });
    }

    // Notify all OTHER connections about the new peer
    this.broadcast(
      { type: "peer-joined", peerId: sender.id, name: trimmedName },
      sender.id
    );

    // Send full room state to everyone
    this.broadcastState();
  }

  private handleJoinQueue(sender: Party.Connection) {
    if (!this.participants.has(sender.id)) {
      this.send(sender, {
        type: "error",
        message: "Must join the room before joining the queue",
      });
      return;
    }

    // Don't add duplicates
    if (this.queue.includes(sender.id)) {
      return;
    }

    this.queue.push(sender.id);

    // If nobody is singing, promote
    if (this.currentSingerId === null) {
      this.promoteNextSinger();
    }

    this.broadcastState();
  }

  private handleLeaveQueue(sender: Party.Connection) {
    const idx = this.queue.indexOf(sender.id);
    if (idx !== -1) {
      this.queue.splice(idx, 1);
    }

    // If they were the current singer and chose to leave queue, clear them
    if (this.currentSingerId === sender.id) {
      this.currentSingerId = null;
      this.promoteNextSinger();
    }

    this.broadcastState();
  }

  private handleFinishSinging(sender: Party.Connection) {
    if (this.currentSingerId !== sender.id) {
      this.send(sender, {
        type: "error",
        message: "You are not the current singer",
      });
      return;
    }

    this.currentSingerId = null;
    this.promoteNextSinger();
    this.broadcastState();
  }

  private handleSignal(
    sender: Party.Connection,
    to: string,
    payload: SignalPayload
  ) {
    const target = this.participants.get(to);
    if (!target) {
      this.send(sender, { type: "error", message: "Target peer not found" });
      return;
    }

    this.send(target.ws, {
      type: "signal",
      from: sender.id,
      payload,
    });
  }

  // ── Helpers ─────────────────────────────────────────────────

  private promoteNextSinger() {
    if (this.currentSingerId !== null) return;
    if (this.queue.length === 0) return;

    // Only promote participants that are still connected
    while (this.queue.length > 0) {
      const nextId = this.queue.shift()!;
      if (this.participants.has(nextId)) {
        this.currentSingerId = nextId;
        return;
      }
      // If the participant disconnected, skip and try the next one
    }
  }

  private buildRoomState(): RoomState {
    const participants = Array.from(this.participants.entries()).map(
      ([id, entry]) => ({ id, name: entry.name })
    );
    return {
      participants,
      queue: [...this.queue],
      currentSingerId: this.currentSingerId,
    };
  }

  private broadcastState() {
    const msg: ServerMessage = {
      type: "room-state",
      state: this.buildRoomState(),
    };
    this.broadcast(msg);
  }

  private broadcast(msg: ServerMessage, excludeId?: string) {
    const raw = JSON.stringify(msg);
    for (const [id, entry] of this.participants) {
      if (id !== excludeId) {
        entry.ws.send(raw);
      }
    }
  }

  private send(conn: Party.Connection, msg: ServerMessage) {
    conn.send(JSON.stringify(msg));
  }
}
