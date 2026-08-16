import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { classifyGenre, type Genre } from "~/lib/atmosphereGenre";
import { YOUTUBE_ID_RE } from "~/lib/youtube";

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
  genre: Genre;
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

interface Snippet {
  title?: string;
  channelTitle?: string;
  thumbnails?: { medium?: { url?: string }; default?: { url?: string } };
}

interface SearchItem {
  id?: { videoId?: string };
  snippet?: Snippet;
}

interface VideoItem {
  id?: string;
  snippet?: Snippet;
  contentDetails?: { duration?: string };
  topicDetails?: { topicIds?: string[]; relevantTopicIds?: string[]; topicCategories?: string[] };
}

function thumbnailOf(snippet: Snippet | undefined): string {
  return snippet?.thumbnails?.medium?.url ?? snippet?.thumbnails?.default?.url ?? "";
}

function genreOf(video: VideoItem | undefined, title: string, channel: string): Genre {
  return classifyGenre({
    topicIds: [...(video?.topicDetails?.topicIds ?? []), ...(video?.topicDetails?.relevantTopicIds ?? [])],
    topicCategories: video?.topicDetails?.topicCategories ?? [],
    title,
    channel,
  });
}

async function fetchVideos(ids: string[], apiKey: string): Promise<Map<string, VideoItem>> {
  const byId = new Map<string, VideoItem>();
  if (ids.length === 0) return byId;

  const videosUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
  videosUrl.searchParams.set("part", "snippet,contentDetails,topicDetails");
  videosUrl.searchParams.set("id", ids.join(","));
  videosUrl.searchParams.set("key", apiKey);

  const response = await fetch(videosUrl);
  if (!response.ok) return byId;
  const data = (await response.json()) as { items?: VideoItem[] };
  for (const video of data.items ?? []) {
    if (video.id) byId.set(video.id, video);
  }
  return byId;
}

async function lookupById(videoId: string, apiKey: string): Promise<NextResponse> {
  const cacheKey = `yt-video:${videoId}`;
  const store = getRedis();
  if (store) {
    const cached = await store.get<YouTubeSearchResult>(cacheKey).catch(() => null);
    if (cached) return NextResponse.json({ results: [cached] });
  }

  const video = (await fetchVideos([videoId], apiKey)).get(videoId);
  if (!video) return NextResponse.json({ results: [] });

  const title = decodeEntities(video.snippet?.title ?? "Untitled");
  const channel = decodeEntities(video.snippet?.channelTitle ?? "");
  const result: YouTubeSearchResult = {
    videoId,
    title,
    channel,
    thumbnail: thumbnailOf(video.snippet),
    duration: formatIsoDuration(video.contentDetails?.duration ?? ""),
    genre: genreOf(video, title, channel),
  };

  if (store) await store.set(cacheKey, result, { ex: CACHE_TTL_S }).catch(() => {});
  return NextResponse.json({ results: [result] });
}

export async function GET(request: Request) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return NextResponse.json({ disabled: true, results: [] });

  const params = new URL(request.url).searchParams;

  const id = params.get("id")?.trim() ?? "";
  if (id) {
    if (!YOUTUBE_ID_RE.test(id)) return NextResponse.json({ results: [] });
    return lookupById(id, apiKey);
  }

  const q = params.get("q")?.trim() ?? "";
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

  const videos = await fetchVideos(
    items.map((item) => item.id?.videoId ?? "").filter(Boolean),
    apiKey,
  );

  const results: YouTubeSearchResult[] = items.map((item) => {
    const videoId = item.id?.videoId ?? "";
    const video = videos.get(videoId);
    const title = decodeEntities(item.snippet?.title ?? "Untitled");
    const channel = decodeEntities(item.snippet?.channelTitle ?? "");
    return {
      videoId,
      title,
      channel,
      thumbnail: thumbnailOf(item.snippet),
      duration: formatIsoDuration(video?.contentDetails?.duration ?? ""),
      genre: genreOf(video, title, channel),
    };
  });

  if (store) await store.set(cacheKey, results, { ex: CACHE_TTL_S }).catch(() => {});
  return NextResponse.json({ results });
}
