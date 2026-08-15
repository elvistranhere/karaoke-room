import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

const MAX_RESULTS = 8;
const CACHE_TTL_S = 86_400;

let redis: Redis | null = null;
function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

export interface YouTubeSearchResult {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
  duration: string;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function formatIsoDuration(iso: string): string {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!match) return "";
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

interface SearchItem {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    channelTitle?: string;
    thumbnails?: { medium?: { url?: string }; default?: { url?: string } };
  };
}

interface VideoItem {
  id?: string;
  contentDetails?: { duration?: string };
}

export async function GET(request: Request) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return NextResponse.json({ disabled: true, results: [] });

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2 || q.length > 100) return NextResponse.json({ results: [] });

  const cacheKey = `yt-search:${q.toLowerCase()}`;
  const store = getRedis();
  if (store) {
    const cached = await store.get<YouTubeSearchResult[]>(cacheKey).catch(() => null);
    if (cached) return NextResponse.json({ results: cached });
  }

  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
  searchUrl.searchParams.set("part", "snippet");
  searchUrl.searchParams.set("type", "video");
  searchUrl.searchParams.set("videoEmbeddable", "true");
  searchUrl.searchParams.set("videoSyndicated", "true");
  searchUrl.searchParams.set("maxResults", String(MAX_RESULTS));
  searchUrl.searchParams.set("q", q);
  searchUrl.searchParams.set("key", apiKey);

  const searchResponse = await fetch(searchUrl);
  if (!searchResponse.ok) {
    return NextResponse.json({ error: "YouTube search failed" }, { status: 502 });
  }
  const searchData = (await searchResponse.json()) as { items?: SearchItem[] };
  const items = (searchData.items ?? []).filter((item) => item.id?.videoId);

  const durations = new Map<string, string>();
  if (items.length > 0) {
    const videosUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
    videosUrl.searchParams.set("part", "contentDetails");
    videosUrl.searchParams.set("id", items.map((item) => item.id?.videoId).join(","));
    videosUrl.searchParams.set("key", apiKey);
    const videosResponse = await fetch(videosUrl);
    if (videosResponse.ok) {
      const videosData = (await videosResponse.json()) as { items?: VideoItem[] };
      for (const video of videosData.items ?? []) {
        if (video.id) durations.set(video.id, formatIsoDuration(video.contentDetails?.duration ?? ""));
      }
    }
  }

  const results: YouTubeSearchResult[] = items.map((item) => ({
    videoId: item.id?.videoId ?? "",
    title: decodeEntities(item.snippet?.title ?? "Untitled"),
    channel: decodeEntities(item.snippet?.channelTitle ?? ""),
    thumbnail: item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url ?? "",
    duration: durations.get(item.id?.videoId ?? "") ?? "",
  }));

  if (store) await store.set(cacheKey, results, { ex: CACHE_TTL_S }).catch(() => {});
  return NextResponse.json({ results });
}
