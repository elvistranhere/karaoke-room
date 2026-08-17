import type * as Party from "partykit/server";
import { recordEnvReader } from "../src/shared/env";
import { runYouTubeSearch } from "../src/shared/youtubeSearch";
import {
  corsFor,
  forbiddenOrigin,
  jsonResponse,
  preflightResponse,
  rateBucketFor,
  rateLimited,
  RateLimiter,
} from "./http";
import { configurePartyLog } from "./log";

// A burst brake only. It is not what protects the YouTube quota and cannot be: 20/min
// still spends the whole 10k daily budget in an hour, and a single Durable Object's
// memory cannot see the other instances. The quota is held by the shared daily miss
// counter in `src/shared/youtubeSearch.ts`, which is in Redis and therefore global.
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

// GET /parties/search/global?q=<query> or ?id=<videoId>
// Unlike token minting this stays on one `global` instance: search is typed by hand, so
// its rate is orders of magnitude below the join path, and one instance is what makes the
// per-IP brake mean anything at all. The throughput ceiling of a single Durable Object is
// the accepted cost; move it to a shard key if search ever sits on a hot path.
export default class SearchEndpoint implements Party.Server {
  private limiter = new RateLimiter(RATE_LIMIT, RATE_WINDOW_MS);

  constructor(readonly room: Party.Room) {}

  async onRequest(req: Party.Request) {
    // This party has no onStart, so the request is where PARTY_DEBUG arms the gate for
    // its own logs and for the src/shared/ modules it calls.
    configurePartyLog(this.room.env);
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

    const answer = await runYouTubeSearch(
      new URL(req.url).searchParams,
      recordEnvReader(this.room.env),
    );
    return jsonResponse(answer.body, answer.status, cors.headers);
  }
}
