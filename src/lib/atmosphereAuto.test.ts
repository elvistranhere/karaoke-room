import { describe, expect, it } from "vitest";
import { avoidDangerHue, composeAtmosphere, oklchToLinearSrgb } from "./atmosphereAuto";
import { GENRE_PRESETS } from "./atmosphereGenre";

function hueOf(color: string): number {
  const parts = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/.exec(color);
  if (!parts) throw new Error(`not an oklch color: ${color}`);
  return Number(parts[3]);
}

function chromaOf(color: string): number {
  const parts = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/.exec(color);
  if (!parts) throw new Error(`not an oklch color: ${color}`);
  return Number(parts[2]);
}

function lightnessOf(color: string): number {
  const parts = /^oklch\(([\d.]+) /.exec(color);
  if (!parts) throw new Error(`not an oklch color: ${color}`);
  return Number(parts[1]);
}

function isInSrgbGamut(color: string): boolean {
  const parts = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)/.exec(color);
  if (!parts) throw new Error(`not an oklch color: ${color}`);
  const channels = oklchToLinearSrgb(Number(parts[1]), Number(parts[2]), Number(parts[3]));
  return channels.every((channel) => channel >= -0.001 && channel <= 1.001);
}

describe("composeAtmosphere", () => {
  it("emits oklch colors for every mesh slot", () => {
    const tokens = composeAtmosphere({ hue: 200, chroma: 0.8 }, GENRE_PRESETS.pop);
    for (const color of [tokens.a, tokens.b, tokens.c, tokens.glow, tokens.tint]) {
      expect(color).toMatch(/^oklch\([\d.]+ [\d.]+ [\d.]+\)$/);
    }
  });

  it("keeps the thumbnail hue as the anchor of the mesh", () => {
    const tokens = composeAtmosphere({ hue: 200, chroma: 0.8 }, GENRE_PRESETS.default);
    expect(hueOf(tokens.a)).toBeCloseTo(200, 0);
    expect(hueOf(tokens.glow)).toBeCloseTo(200, 0);
  });

  it("spreads the mesh by the preset amount and wraps past 360", () => {
    const tokens = composeAtmosphere({ hue: 350, chroma: 0.8 }, GENRE_PRESETS.dance);
    const base = hueOf(tokens.a);
    expect(hueOf(tokens.b)).toBeLessThan(360);
    expect(hueOf(tokens.b)).toBeGreaterThanOrEqual(0);
    expect(hueOf(tokens.b)).toBeCloseTo((base + GENRE_PRESETS.dance.spread) % 360, 0);
    expect(hueOf(tokens.c)).toBeCloseTo(base - GENRE_PRESETS.dance.spread, 0);
  });

  it("falls back to the idle violet hue without a palette", () => {
    const tokens = composeAtmosphere(null, GENRE_PRESETS.default);
    expect(hueOf(tokens.a)).toBeCloseTo(292, 0);
  });

  it("carries the genre behavior through unchanged", () => {
    const tokens = composeAtmosphere({ hue: 120, chroma: 0.6 }, GENRE_PRESETS.ballad);
    expect(tokens.pulseMs).toBe(GENRE_PRESETS.ballad.pulseMs);
    expect(tokens.saturation).toBe(GENRE_PRESETS.ballad.saturation);
    expect(tokens.warmth).toBe(GENRE_PRESETS.ballad.warmth);
    expect(tokens.contrast).toBe(GENRE_PRESETS.ballad.contrast);
  });

  it("gives a dance preset more chroma than a lo-fi one from the same thumbnail", () => {
    const palette = { hue: 260, chroma: 0.7 };
    expect(chromaOf(composeAtmosphere(palette, GENRE_PRESETS.dance).a)).toBeGreaterThan(
      chromaOf(composeAtmosphere(palette, GENRE_PRESETS.lofi).a),
    );
  });

  it("clamps chroma so a neon thumbnail cannot blow out the mesh", () => {
    const tokens = composeAtmosphere({ hue: 300, chroma: 1 }, GENRE_PRESETS.dance);
    expect(chromaOf(tokens.a)).toBeLessThanOrEqual(0.3);
    expect(chromaOf(tokens.glow)).toBeLessThanOrEqual(0.34);
  });

  it("pulls a warm preset toward amber and a cool preset toward blue", () => {
    const palette = { hue: 200, chroma: 0.7 };
    expect(hueOf(composeAtmosphere(palette, GENRE_PRESETS.folk).a)).toBeLessThan(200);
    expect(hueOf(composeAtmosphere(palette, GENRE_PRESETS.dance).a)).toBeGreaterThan(200);
  });

  it("locks the accent lightness so contrast never rides on the thumbnail", () => {
    const dull = composeAtmosphere({ hue: 200, chroma: 0.1 }, GENRE_PRESETS.lofi);
    const neon = composeAtmosphere({ hue: 200, chroma: 1 }, GENRE_PRESETS.dance);
    expect(dull.accent).toMatch(/^oklch\(0\.606 /);
    expect(neon.accent).toMatch(/^oklch\(0\.606 /);
    expect(dull.accentSoft).toMatch(/^oklch\(0\.791 /);
    expect(neon.accentBright).toMatch(/^oklch\(0\.839 /);
    expect(neon.accentLevel).toMatch(/^oklch\(0\.728 /);
    expect(chromaOf(dull.accent)).toBe(chromaOf(neon.accent));
    expect(neon.accentDim).toMatch(/ \/ 0\.14\)$/);
  });

  it("keeps every accent band inside sRGB at every hue", () => {
    for (let hue = 0; hue < 360; hue += 1) {
      const tokens = composeAtmosphere({ hue, chroma: 1 }, GENRE_PRESETS.dance);
      for (const color of [tokens.accent, tokens.accentSoft, tokens.accentBright, tokens.accentLevel, tokens.accentDim]) {
        expect(isInSrgbGamut(color), `${color} at hue ${hue}`).toBe(true);
      }
    }
  });

  it("keeps the accent scale ordered from accent up to bright at every hue", () => {
    for (let hue = 0; hue < 360; hue += 1) {
      const tokens = composeAtmosphere({ hue, chroma: 0.7 }, GENRE_PRESETS.pop);
      expect(lightnessOf(tokens.accent)).toBeLessThan(lightnessOf(tokens.accentLevel));
      expect(lightnessOf(tokens.accentLevel)).toBeLessThan(lightnessOf(tokens.accentSoft));
      expect(lightnessOf(tokens.accentSoft)).toBeLessThan(lightnessOf(tokens.accentBright));
    }
  });

  it("converts a known oklch color to the sRGB channels of the idle violet", () => {
    const [r, g, b] = oklchToLinearSrgb(0.606, 0.219, 292.7);
    const encode = (channel: number) => Math.round(255 * (channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055));
    expect(encode(r)).toBeCloseTo(139, -0.5);
    expect(encode(g)).toBeCloseTo(92, -0.5);
    expect(encode(b)).toBeCloseTo(246, -0.5);
  });

  it("keeps the accent on the thumbnail hue when it clears the danger window", () => {
    expect(avoidDangerHue(200)).toBe(200);
    expect(hueOf(composeAtmosphere({ hue: 200, chroma: 0.7 }, GENRE_PRESETS.default).accent)).toBeCloseTo(200, 0);
  });

  it("pushes a hue that lands inside the danger window out to the nearest edge", () => {
    expect(avoidDangerHue(15)).toBe(7);
    expect(avoidDangerHue(35)).toBe(43);
    expect(avoidDangerHue(7)).toBe(7);
    expect(avoidDangerHue(43)).toBe(43);
  });

  it("never leaves the accent reading as destructive red", () => {
    for (let hue = 0; hue < 360; hue += 1) {
      const accentHue = avoidDangerHue(hue);
      const distance = Math.abs(((accentHue - 25 + 540) % 360) - 180);
      expect(distance).toBeGreaterThanOrEqual(18);
    }
  });
});
