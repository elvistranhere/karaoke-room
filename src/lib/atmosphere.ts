import { readPref, writePref } from "./prefs";

export const ATMOSPHERE_PREF_KEY = "karaoke-theme";
export const ATMOSPHERE_FADE_MS = 2000;

export type AtmosphereProviderId = "auto";
export const DEFAULT_ATMOSPHERE_PROVIDER: AtmosphereProviderId = "auto";

export interface AtmosphereTokens {
  a: string;
  b: string;
  c: string;
  glow: string;
  tint: string;
  accent: string;
  accentSoft: string;
  accentDim: string;
  accentBright: string;
  accentLevel: string;
  pulseMs: number;
  saturation: number;
  warmth: number;
  contrast: number;
}

export interface AtmosphereSong {
  videoId: string;
  songName: string | null;
}

export interface AtmosphereProvider {
  readonly id: AtmosphereProviderId;
  readonly label: string;
  resolve(song: AtmosphereSong | null, signal: AbortSignal): Promise<AtmosphereTokens>;
}

export const IDLE_TOKENS: AtmosphereTokens = {
  a: "oklch(0.460 0.150 292.0)",
  b: "oklch(0.396 0.123 322.0)",
  c: "oklch(0.506 0.105 262.0)",
  glow: "oklch(0.680 0.188 292.0)",
  tint: "oklch(0.156 0.075 292.0)",
  accent: "#8B5CF6",
  accentSoft: "#C9A7FF",
  accentDim: "rgba(139, 92, 246, 0.15)",
  accentBright: "#D7BBFF",
  accentLevel: "#B78CFF",
  pulseMs: 3600,
  saturation: 0.9,
  warmth: 0,
  contrast: 0.5,
};

const COLOR_VARS = [
  "--atmo-a",
  "--atmo-b",
  "--atmo-c",
  "--atmo-glow",
  "--atmo-tint",
  "--atmo-accent",
  "--atmo-accent-soft",
  "--atmo-accent-dim",
  "--atmo-accent-bright",
  "--atmo-accent-level",
] as const;

const NUMBER_VARS = ["--atmo-saturation", "--atmo-warmth", "--atmo-contrast"] as const;

const REGISTRATIONS: PropertyDefinition[] = [
  { name: "--atmo-a", syntax: "<color>", inherits: true, initialValue: IDLE_TOKENS.a },
  { name: "--atmo-b", syntax: "<color>", inherits: true, initialValue: IDLE_TOKENS.b },
  { name: "--atmo-c", syntax: "<color>", inherits: true, initialValue: IDLE_TOKENS.c },
  { name: "--atmo-glow", syntax: "<color>", inherits: true, initialValue: IDLE_TOKENS.glow },
  { name: "--atmo-tint", syntax: "<color>", inherits: true, initialValue: IDLE_TOKENS.tint },
  { name: "--atmo-accent", syntax: "<color>", inherits: true, initialValue: IDLE_TOKENS.accent },
  { name: "--atmo-accent-soft", syntax: "<color>", inherits: true, initialValue: IDLE_TOKENS.accentSoft },
  { name: "--atmo-accent-dim", syntax: "<color>", inherits: true, initialValue: IDLE_TOKENS.accentDim },
  { name: "--atmo-accent-bright", syntax: "<color>", inherits: true, initialValue: IDLE_TOKENS.accentBright },
  { name: "--atmo-accent-level", syntax: "<color>", inherits: true, initialValue: IDLE_TOKENS.accentLevel },
  { name: "--atmo-strength", syntax: "<number>", inherits: true, initialValue: "0" },
  { name: "--atmo-pulse", syntax: "<time>", inherits: true, initialValue: `${IDLE_TOKENS.pulseMs}ms` },
  { name: "--atmo-saturation", syntax: "<number>", inherits: true, initialValue: String(IDLE_TOKENS.saturation) },
  { name: "--atmo-warmth", syntax: "<number>", inherits: true, initialValue: String(IDLE_TOKENS.warmth) },
  { name: "--atmo-contrast", syntax: "<number>", inherits: true, initialValue: String(IDLE_TOKENS.contrast) },
];

let registered = false;

export function registerAtmosphereProperties(): void {
  if (registered || typeof CSS === "undefined" || typeof CSS.registerProperty !== "function") return;
  registered = true;
  for (const definition of REGISTRATIONS) {
    try {
      CSS.registerProperty(definition);
    } catch {
      // already registered by an earlier mount or a hot reload
    }
  }
}

export function primeAtmosphereRoot(root: HTMLElement): void {
  root.style.transitionProperty = [...COLOR_VARS, ...NUMBER_VARS].join(", ");
  root.style.transitionDuration = `${ATMOSPHERE_FADE_MS}ms`;
  root.style.transitionTimingFunction = "cubic-bezier(0.4, 0, 0.2, 1)";
}

export function applyAtmosphere(root: HTMLElement, tokens: AtmosphereTokens): void {
  root.style.setProperty("--atmo-a", tokens.a);
  root.style.setProperty("--atmo-b", tokens.b);
  root.style.setProperty("--atmo-c", tokens.c);
  root.style.setProperty("--atmo-glow", tokens.glow);
  root.style.setProperty("--atmo-tint", tokens.tint);
  root.style.setProperty("--atmo-accent", tokens.accent);
  root.style.setProperty("--atmo-accent-soft", tokens.accentSoft);
  root.style.setProperty("--atmo-accent-dim", tokens.accentDim);
  root.style.setProperty("--atmo-accent-bright", tokens.accentBright);
  root.style.setProperty("--atmo-accent-level", tokens.accentLevel);
  root.style.setProperty("--atmo-saturation", String(tokens.saturation));
  root.style.setProperty("--atmo-warmth", String(tokens.warmth));
  root.style.setProperty("--atmo-contrast", String(tokens.contrast));
  root.style.setProperty("--atmo-pulse", `${Math.round(tokens.pulseMs)}ms`);
}

let lastStrength = -1;

// Kept out of the cross-fade transition list, and only reaches the DOM when the value moved.
export function setAtmosphereStrength(root: HTMLElement, level: number): void {
  const next = Math.round(Math.min(1, Math.max(0, level)) * 100) / 100;
  if (next === lastStrength) return;
  lastStrength = next;
  root.style.setProperty("--atmo-strength", String(next));
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function readAtmospherePref(): AtmosphereProviderId {
  const stored = readPref(ATMOSPHERE_PREF_KEY);
  if (stored === "auto") return stored;
  writePref(ATMOSPHERE_PREF_KEY, DEFAULT_ATMOSPHERE_PROVIDER);
  return DEFAULT_ATMOSPHERE_PROVIDER;
}

export function writeAtmospherePref(id: AtmosphereProviderId): void {
  writePref(ATMOSPHERE_PREF_KEY, id);
}
