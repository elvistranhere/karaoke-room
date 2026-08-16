import { youtubeThumbnailUrl } from "./youtube";

export interface HuePalette {
  hue: number;
  chroma: number;
}

const BUCKETS = 24;
const BUCKET_SIZE = 360 / BUCKETS;
const MIN_SATURATION = 0.18;
const MIN_LIGHTNESS = 0.12;
const MAX_LIGHTNESS = 0.92;
const SAMPLE_SIZE = 32;
const LOAD_TIMEOUT_MS = 4000;
const CACHE_KEY = "karaoke-atmo-palette";
const CACHE_LIMIT = 80;

function toHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return { h: 0, s: 0, l };

  const s = delta / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = 60 * (((gn - bn) / delta) % 6);
  else if (max === gn) h = 60 * ((bn - rn) / delta + 2);
  else h = 60 * ((rn - gn) / delta + 4);

  return { h: (h + 360) % 360, s, l };
}

export function dominantHue(pixels: ArrayLike<number>): HuePalette | null {
  const weights = new Float64Array(BUCKETS);
  const sinSum = new Float64Array(BUCKETS);
  const cosSum = new Float64Array(BUCKETS);
  const satSum = new Float64Array(BUCKETS);

  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const alpha = pixels[i + 3] ?? 0;
    if (alpha < 128) continue;
    const { h, s, l } = toHsl(pixels[i] ?? 0, pixels[i + 1] ?? 0, pixels[i + 2] ?? 0);
    if (s < MIN_SATURATION || l < MIN_LIGHTNESS || l > MAX_LIGHTNESS) continue;

    const bucket = Math.min(BUCKETS - 1, Math.floor(h / BUCKET_SIZE));
    const weight = s * (1 - Math.abs(l - 0.5) * 0.6);
    const radians = (h * Math.PI) / 180;
    weights[bucket] = (weights[bucket] ?? 0) + weight;
    sinSum[bucket] = (sinSum[bucket] ?? 0) + Math.sin(radians) * weight;
    cosSum[bucket] = (cosSum[bucket] ?? 0) + Math.cos(radians) * weight;
    satSum[bucket] = (satSum[bucket] ?? 0) + s * weight;
  }

  let best = -1;
  let bestWeight = 0;
  for (let bucket = 0; bucket < BUCKETS; bucket++) {
    const weight = weights[bucket] ?? 0;
    if (weight > bestWeight) {
      bestWeight = weight;
      best = bucket;
    }
  }
  if (best < 0 || bestWeight <= 0) return null;

  const hue = (Math.atan2(sinSum[best] ?? 0, cosSum[best] ?? 0) * 180) / Math.PI;
  return {
    hue: (hue + 360) % 360,
    chroma: Math.min(1, (satSum[best] ?? 0) / bestWeight),
  };
}

type PaletteCache = Record<string, [number, number] | null>;

function readCache(): PaletteCache {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as PaletteCache) : {};
  } catch {
    return {};
  }
}

function writeCache(videoId: string, palette: HuePalette | null): void {
  if (typeof window === "undefined") return;
  const cache = readCache();
  delete cache[videoId];
  cache[videoId] = palette ? [Math.round(palette.hue * 10) / 10, Math.round(palette.chroma * 1000) / 1000] : null;
  const keys = Object.keys(cache);
  for (const stale of keys.slice(0, Math.max(0, keys.length - CACHE_LIMIT))) delete cache[stale];
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // storage unavailable, extraction just runs again next time
  }
}

function loadThumbnail(videoId: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    const timer = window.setTimeout(() => {
      image.src = "";
      resolve(null);
    }, LOAD_TIMEOUT_MS);
    image.onload = () => {
      window.clearTimeout(timer);
      resolve(image);
    };
    image.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    image.src = youtubeThumbnailUrl(videoId);
  });
}

export async function loadPalette(videoId: string): Promise<HuePalette | null> {
  const cache = readCache();
  if (videoId in cache) {
    const entry = cache[videoId];
    return entry ? { hue: entry[0], chroma: entry[1] } : null;
  }

  const image = await loadThumbnail(videoId);
  if (!image) {
    writeCache(videoId, null);
    return null;
  }

  let palette: HuePalette | null = null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = SAMPLE_SIZE;
    canvas.height = SAMPLE_SIZE;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (context) {
      context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
      palette = dominantHue(context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data);
    }
  } catch {
    // a tainted canvas means no CORS headers on the thumbnail, fall back to the preset hue
    return null;
  }

  writeCache(videoId, palette);
  return palette;
}
