import { classifyGenre, type Genre } from "../lib/atmosphereGenre";
import { YOUTUBE_ID_RE, type YouTubeSearchResult } from "../lib/youtube";
import type { EnvReader } from "./env";
import { getRedis, type RedisClient } from "./redis";

// YouTube Data API v3 lookups, shared by the PartyKit endpoint and the legacy Next
// route. search.list costs 100 of the 10k daily quota units, so every answer is
// cached 24h in Redis and a missing key disables the feature rather than failing.

export type { YouTubeSearchResult };

const MAX_RESULTS = 8;
const CACHE_TTL_S = 86_400;

// The whole day is 10,000 units and one cache miss is 101 of them, so ~99 unique queries
// exhausts it. The per-IP rate limit in front of this endpoint cannot see across worker
// instances or across IPs, so the budget that actually holds is one shared counter: past
// it, a miss answers with the same empty fail-soft the client already handles rather than
// spending the rest of the day's quota on whoever is typing fastest.
const DAILY_MISS_BUDGET = 80;
const QUOTA_COUNTER_TTL_S = 172_800;

export interface SearchAnswer {
  status: number;
  body: { results?: YouTubeSearchResult[]; disabled?: boolean; error?: string };
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

// Counts the miss before the call, because the quota is spent whether or not the answer
// comes back. Without Redis there is no counter and no cache either, so the endpoint runs
// on the per-IP brake alone and the caller is told nothing new.
async function claimMissBudget(store: RedisClient | null): Promise<boolean> {
  if (!store) return true;
  const counterKey = `yt-quota:${new Date().toISOString().slice(0, 10)}`;
  try {
    const used = await store.incr(counterKey);
    if (used === 1) await store.expire(counterKey, QUOTA_COUNTER_TTL_S);
    if (used > DAILY_MISS_BUDGET) {
      console.warn("[YouTubeSearch] daily search.list budget spent", { used, budget: DAILY_MISS_BUDGET });
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

async function lookupById(videoId: string, apiKey: string, env: EnvReader): Promise<SearchAnswer> {
  const cacheKey = `yt-video:${videoId}`;
  const store = getRedis(env);
  if (store) {
    const cached = await store.get<YouTubeSearchResult>(cacheKey).catch(() => null);
    if (cached) return { status: 200, body: { results: [cached] } };
  }

  const video = (await fetchVideos([videoId], apiKey)).get(videoId);
  if (!video) return { status: 200, body: { results: [] } };

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
  return { status: 200, body: { results: [result] } };
}

export async function runYouTubeSearch(params: URLSearchParams, env: EnvReader): Promise<SearchAnswer> {
  const apiKey = env("YOUTUBE_API_KEY");
  if (!apiKey) return { status: 200, body: { disabled: true, results: [] } };

  const id = params.get("id")?.trim() ?? "";
  if (id) {
    if (!YOUTUBE_ID_RE.test(id)) return { status: 200, body: { results: [] } };
    return lookupById(id, apiKey, env);
  }

  const q = params.get("q")?.trim() ?? "";
  if (q.length < 2 || q.length > 100) return { status: 200, body: { results: [] } };

  const cacheKey = `yt-search:${q.toLowerCase()}`;
  const store = getRedis(env);
  if (store) {
    const cached = await store.get<YouTubeSearchResult[]>(cacheKey).catch(() => null);
    if (cached) return { status: 200, body: { results: cached } };
  }

  if (!(await claimMissBudget(store))) return { status: 200, body: { results: [] } };

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
    return { status: 502, body: { error: "YouTube search failed" } };
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
  return { status: 200, body: { results } };
}
