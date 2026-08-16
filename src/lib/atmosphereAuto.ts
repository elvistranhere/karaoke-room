import type { AtmosphereProvider, AtmosphereSong, AtmosphereTokens } from "./atmosphere";
import { IDLE_TOKENS } from "./atmosphere";
import { GENRE_PRESETS, isGenre, type Genre, type GenrePreset } from "./atmosphereGenre";
import { loadPalette, type HuePalette } from "./atmospherePalette";

const IDLE_HUE = 292;
const IDLE_CHROMA = 0.68;
const WARM_ANCHOR = 70;
const COOL_ANCHOR = 250;
const MAX_ANCHOR_PULL = 14;
const DANGER_HUE = 25;
const DANGER_GUARD = 18;
// Lightness and chroma of the idle violet family, so a playing song only moves the hue.
const ACCENT_BAND = { l: 0.606, c: 0.219 };
const ACCENT_LEVEL_BAND = { l: 0.728, c: 0.166 };
const ACCENT_SOFT_BAND = { l: 0.791, c: 0.127 };
const ACCENT_BRIGHT_BAND = { l: 0.839, c: 0.098 };
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

function oklcha(lightness: number, chroma: number, hue: number, alpha: number): string {
  return `oklch(${lightness.toFixed(3)} ${chroma.toFixed(3)} ${wrapHue(hue).toFixed(1)} / ${alpha})`;
}

export function oklchToLinearSrgb(lightness: number, chroma: number, hue: number): [number, number, number] {
  const radians = (wrapHue(hue) * Math.PI) / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function inSrgbGamut(lightness: number, chroma: number, hue: number): boolean {
  return oklchToLinearSrgb(lightness, chroma, hue).every((channel) => channel >= 0 && channel <= 1);
}

// A band outside sRGB would be gamut-mapped by the browser, which moves lightness too, so clamp here.
// The result is quantized to the three decimals the token is printed with, so the emitted color is the tested one.
export function srgbSafeChroma(lightness: number, chroma: number, hue: number): number {
  let low = 0;
  let high = chroma;
  if (inSrgbGamut(lightness, chroma, hue)) low = chroma;
  else {
    for (let step = 0; step < 20; step += 1) {
      const mid = (low + high) / 2;
      if (inSrgbGamut(lightness, mid, hue)) low = mid;
      else high = mid;
    }
  }
  let thousandths = Math.floor(low * 1000);
  while (thousandths > 0 && !inSrgbGamut(lightness, thousandths / 1000, hue)) thousandths -= 1;
  return thousandths / 1000;
}

function band(lightness: number, chroma: number, hue: number): string {
  return oklch(lightness, srgbSafeChroma(lightness, chroma, hue), hue);
}

// Action buttons must never read as destructive, so the accent hue skips the danger red window.
export function avoidDangerHue(hue: number): number {
  const wrapped = wrapHue(hue);
  const delta = ((wrapped - DANGER_HUE + 540) % 360) - 180;
  if (Math.abs(delta) >= DANGER_GUARD) return wrapped;
  return wrapHue(DANGER_HUE + (delta < 0 ? -DANGER_GUARD : DANGER_GUARD));
}

export function composeAtmosphere(palette: HuePalette | null, preset: GenrePreset): AtmosphereTokens {
  const sourceHue = palette ? palette.hue : IDLE_HUE;
  const sourceChroma = palette ? palette.chroma : IDLE_CHROMA;
  const anchor = preset.warmth >= 0 ? WARM_ANCHOR : COOL_ANCHOR;
  const hue = pullToward(sourceHue, anchor, (Math.abs(preset.warmth) * MAX_ANCHOR_PULL) / 100);

  const chroma = clamp(sourceChroma * preset.saturation * 0.24, 0.03, 0.3);
  const lift = preset.lift;
  // The accent bands are the idle violet's own lightness, so button contrast never rides on the thumbnail.
  const accentHue = Number(wrapHue(avoidDangerHue(hue)).toFixed(1));

  return {
    a: oklch(lift, chroma, hue),
    b: oklch(lift * 0.86, chroma * 0.82, hue + preset.spread),
    c: oklch(clamp(lift * 1.12, 0, 0.78), chroma * 0.68, hue - preset.spread),
    glow: oklch(clamp(lift + 0.22, 0, 0.86), clamp(chroma * 1.3, 0, 0.34), hue),
    tint: oklch(clamp(lift * 0.34, 0.06, 0.28), chroma * 0.5, hue),
    accent: band(ACCENT_BAND.l, ACCENT_BAND.c, accentHue),
    accentSoft: band(ACCENT_SOFT_BAND.l, ACCENT_SOFT_BAND.c, accentHue),
    accentDim: oklcha(ACCENT_BAND.l, srgbSafeChroma(ACCENT_BAND.l, ACCENT_BAND.c, accentHue), accentHue, 0.14),
    accentBright: band(ACCENT_BRIGHT_BAND.l, ACCENT_BRIGHT_BAND.c, accentHue),
    accentLevel: band(ACCENT_LEVEL_BAND.l, ACCENT_LEVEL_BAND.c, accentHue),
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
