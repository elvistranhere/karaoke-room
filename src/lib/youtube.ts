import type { Genre } from "./atmosphereGenre";

// The same id shape is enforced server-side in party/index.ts.
export const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

// The search result shape lives here, not next to the search implementation, so no client
// file ever has to name a `~/shared/*` specifier that reads secrets to describe a row.
export interface YouTubeSearchResult {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
  duration: string;
  genre: Genre;
}

const PATH_PREFIXES = ["/embed/", "/shorts/", "/live/", "/v/"];

export function parseYouTubeId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (YOUTUBE_ID_RE.test(trimmed)) return trimmed;

  let url: URL;
  try {
    url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "").toLowerCase();

  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0] ?? "";
    return YOUTUBE_ID_RE.test(id) ? id : null;
  }

  if (host !== "youtube.com" && host !== "m.youtube.com" && host !== "music.youtube.com" && host !== "youtube-nocookie.com") {
    return null;
  }

  const v = url.searchParams.get("v");
  if (v && YOUTUBE_ID_RE.test(v)) return v;

  for (const prefix of PATH_PREFIXES) {
    if (url.pathname.startsWith(prefix)) {
      const id = url.pathname.slice(prefix.length).split("/")[0] ?? "";
      return YOUTUBE_ID_RE.test(id) ? id : null;
    }
  }

  return null;
}

export function youtubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}
