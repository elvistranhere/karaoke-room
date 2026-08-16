import type { AtmosphereProvider, AtmosphereSong, AtmosphereTokens } from "./atmosphere";
import { IDLE_TOKENS } from "./atmosphere";
import { GENRE_PRESETS, isGenre, type Genre, type GenrePreset } from "./atmosphereGenre";
import { loadPalette, type HuePalette } from "./atmospherePalette";

const IDLE_HUE = 292;
const IDLE_CHROMA = 0.68;
const WARM_ANCHOR = 70;
const COOL_ANCHOR = 250;
const MAX_ANCHOR_PULL = 14;
const GENRE_CACHE_KEY = "karaoke-atmo-genre";
const GENRE_CACHE_LIMIT = 120;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function wrapHue(hue: number): number {
  return ((hue % 360) + 360) % 360;
}

function pullToward(hue: number, anchor: number, amount: number): number {
  const delta = ((anchor - hue + 540) % 360) - 180;
  return wrapHue(hue + delta * amount);
}

function oklch(lightness: number, chroma: number, hue: number): string {
  return `oklch(${lightness.toFixed(3)} ${chroma.toFixed(3)} ${wrapHue(hue).toFixed(1)})`;
}

export function composeAtmosphere(palette: HuePalette | null, preset: GenrePreset): AtmosphereTokens {
  const sourceHue = palette ? palette.hue : IDLE_HUE;
  const sourceChroma = palette ? palette.chroma : IDLE_CHROMA;
  const anchor = preset.warmth >= 0 ? WARM_ANCHOR : COOL_ANCHOR;
  const hue = pullToward(sourceHue, anchor, (Math.abs(preset.warmth) * MAX_ANCHOR_PULL) / 100);

  const chroma = clamp(sourceChroma * preset.saturation * 0.24, 0.03, 0.3);
  const lift = preset.lift;

  return {
    a: oklch(lift, chroma, hue),
    b: oklch(lift * 0.86, chroma * 0.82, hue + preset.spread),
    c: oklch(clamp(lift * 1.12, 0, 0.78), chroma * 0.68, hue - preset.spread),
    glow: oklch(clamp(lift + 0.22, 0, 0.86), clamp(chroma * 1.3, 0, 0.34), hue),
    tint: oklch(clamp(lift * 0.34, 0.06, 0.28), chroma * 0.5, hue),
    pulseMs: preset.pulseMs,
    saturation: preset.saturation,
    warmth: preset.warmth,
    contrast: preset.contrast,
  };
}

type GenreCache = Record<string, Genre>;

function readGenreCache(): GenreCache {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(GENRE_CACHE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as GenreCache) : {};
  } catch {
    return {};
  }
}

export function cacheGenre(videoId: string, genre: unknown): void {
  if (isGenre(genre)) writeGenreCache(videoId, genre);
}

function writeGenreCache(videoId: string, genre: Genre): void {
  if (typeof window === "undefined") return;
  const cache = readGenreCache();
  delete cache[videoId];
  cache[videoId] = genre;
  const keys = Object.keys(cache);
  for (const stale of keys.slice(0, Math.max(0, keys.length - GENRE_CACHE_LIMIT))) delete cache[stale];
  try {
    window.localStorage.setItem(GENRE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // storage unavailable, the lookup just runs again next time
  }
}

async function lookupGenre(videoId: string, signal: AbortSignal): Promise<Genre> {
  const cached = readGenreCache()[videoId];
  if (isGenre(cached)) return cached;

  try {
    const response = await fetch(`/api/youtube-search?id=${encodeURIComponent(videoId)}`, { signal });
    if (!response.ok) return "default";
    const data = (await response.json()) as { results?: Array<{ genre?: string }> };
    const genre = data.results?.[0]?.genre;
    // A parsed answer with no usable genre is still an answer, so cache the fallback.
    const resolved: Genre = isGenre(genre) ? genre : "default";
    writeGenreCache(videoId, resolved);
    return resolved;
  } catch {
    return "default";
  }
}

export const autoProvider: AtmosphereProvider = {
  id: "auto",
  label: "Auto",
  async resolve(song: AtmosphereSong | null, signal: AbortSignal): Promise<AtmosphereTokens> {
    if (!song) return IDLE_TOKENS;
    const [palette, genre] = await Promise.all([
      loadPalette(song.videoId).catch(() => null),
      lookupGenre(song.videoId, signal),
    ]);
    return composeAtmosphere(palette, GENRE_PRESETS[genre]);
  },
};
