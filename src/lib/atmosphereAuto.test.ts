import { describe, expect, it } from "vitest";
import { composeAtmosphere } from "./atmosphereAuto";
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
});
