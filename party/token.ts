import type * as Party from "partykit/server";
import { recordEnvReader } from "../src/shared/env";
import { mintLiveKitToken } from "../src/shared/livekitToken";
import {
  corsFor,
  forbiddenOrigin,
  jsonResponse,
  preflightResponse,
  rateBucketFor,
  rateLimited,
  RateLimiter,
} from "./http";

// Sized for a full room reconnecting after a network blip, not for one browser tab: ten
// participants (the LiveKit `maxParticipants`) each run a 3-attempt connect ladder plus a
// 30-minute refresh, and a household or CGNAT public IP puts all of them in one bucket.
// The party is addressed by room code, so this is a per-room-per-IP budget.
const RATE_LIMIT = 120;
const RATE_WINDOW_MS = 60_000;

// GET /parties/token/<ROOMCODE>?room=<ROOMCODE>&name=Alice[&keyHint=next]
// Sharded by room code rather than pinned to one `global` Durable Object, so the join
// path is not serialized through a single instance in a single colo.
// The same minter the legacy /api/livekit-token route runs, so the answer shapes
// (200 token, 400 validation, 429 exhaustion, 500 misconfiguration) are unchanged.
export default class TokenEndpoint implements Party.Server {
  private limiter = new RateLimiter(RATE_LIMIT, RATE_WINDOW_MS);

  constructor(readonly room: Party.Room) {}

  // `keyHint=next` writes shared Redis rotation state: enough distinct room codes
  // reporting one key marks it exhausted for every room on it. Room codes are free to
  // invent, so the report is only honoured for a room that has people in it right now,
  // which the main party for this exact id can answer from the same worker.
  private async roomHasPresence(): Promise<boolean> {
    try {
      const main = this.room.context.parties.main;
      if (!main) return true;
      const res = await main.get(this.room.id).fetch();
      if (!res.ok) return false;
      const state = (await res.json()) as { participants?: number };
      return (state.participants ?? 0) > 0;
    } catch (err) {
      // A failure here must not break real failover for a real room.
      console.warn("[Token] presence check failed, honouring keyHint:", err);
      return true;
    }
  }

  async onRequest(req: Party.Request) {
    const cors = corsFor(req, this.room.env);
    if (!cors.allowed) return forbiddenOrigin(cors.headers);
    if (req.method === "OPTIONS") return preflightResponse(cors.headers);
    if (req.method !== "GET") {
      return jsonResponse({ error: "Method not allowed" }, 405, cors.headers);
    }
    const bucket = rateBucketFor(req);
    if (bucket && !this.limiter.take(bucket)) {
      return rateLimited(cors.headers, RATE_WINDOW_MS / 1000);
    }

    const params = new URL(req.url).searchParams;
    const room = params.get("room");
    // The shard is the budget: a token for room B must not be mintable from room A's
    // instance, or the per-room rate limit and the presence check both mean nothing.
    if (!room || room.toUpperCase() !== this.room.id.toUpperCase()) {
      return jsonResponse({ error: "Room code does not match this endpoint" }, 400, cors.headers);
    }

    const wantsNextKey = params.get("keyHint") === "next";
    const keyHint = wantsNextKey && (await this.roomHasPresence()) ? "next" : null;

    const answer = await mintLiveKitToken(
      { room, name: params.get("name"), keyHint },
      recordEnvReader(this.room.env),
    );
    return jsonResponse(answer.body, answer.status, cors.headers);
  }
}
