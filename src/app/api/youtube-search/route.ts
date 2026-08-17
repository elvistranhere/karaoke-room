// See the note in ../livekit-token/route.ts: this import is the client-bundle barrier for
// everything under `src/shared/` that reads a secret.
import "server-only";
import { NextResponse } from "next/server";
import { processEnvReader } from "~/shared/env";
import { runYouTubeSearch } from "~/shared/youtubeSearch";

// Re-exported for shells cached before `YouTubeSearchResult` moved to `~/lib/youtube`.
export type { YouTubeSearchResult } from "~/lib/youtube";

// LEGACY: the live endpoint is `/parties/search/global` on the PartyKit worker; this route
// stays so web clients cached before that switch keep searching. Both call the same lookup.
export async function GET(request: Request) {
  const answer = await runYouTubeSearch(new URL(request.url).searchParams, processEnvReader());
  return NextResponse.json(answer.body, { status: answer.status });
}
