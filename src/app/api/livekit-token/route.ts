// The barrier that keeps the LiveKit and Upstash secret readers out of a client bundle.
// It cannot live in `src/shared/` (partykit's bundler resolves the browser condition and
// the worker build breaks), so it sits at the Next boundary instead, alongside the biome
// rule that stops `src/components` and `src/hooks` naming those modules at all.
import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { partyOrigin } from "~/lib/apiBase";
import { validateRoomCode } from "~/lib/room-code";
import { processEnvReader } from "~/shared/env";
import { mintLiveKitToken } from "~/shared/livekitToken";
import { createLogger } from "~/lib/logger";

const log = createLogger("livekit-token");

// `keyHint=next` writes rotation state shared by every room on that key, and this route
// reaches the same Redis the worker does, so it owes the same gate `party/token.ts` runs:
// the report is only forwarded for a room that has people in it right now. The worker asks
// its own main party directly; from Vercel that is one HTTP hop, and it only happens on a
// failover attempt.
async function roomHasPresence(room: string): Promise<boolean> {
  if (!validateRoomCode(room)) return false;
  try {
    const res = await fetch(`${partyOrigin()}/parties/main/${room}`, { cache: "no-store" });
    if (!res.ok) return false;
    const state = (await res.json()) as { participants?: number };
    return (state.participants ?? 0) > 0;
  } catch (err) {
    log.warn("presence check failed, honouring keyHint:", err);
    return true;
  }
}

// LEGACY: the live endpoint is `/parties/token/<ROOMCODE>` on the PartyKit worker; this
// route stays so web clients cached before that switch keep connecting, and as the
// same-origin fallback for a browser the worker's allowlist refuses. Both call the same
// minter.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const room = params.get("room");
  const wantsNextKey = params.get("keyHint") === "next";
  const keyHint = room && wantsNextKey && (await roomHasPresence(room.toUpperCase())) ? "next" : null;

  const answer = await mintLiveKitToken(
    { room, name: params.get("name"), keyHint },
    processEnvReader(),
  );
  return NextResponse.json(answer.body, { status: answer.status });
}
