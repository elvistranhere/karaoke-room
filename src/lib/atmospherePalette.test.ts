import { describe, expect, it } from "vitest";
import { dominantHue } from "./atmospherePalette";

function pixels(colors: Array<[number, number, number]>, alpha = 255): number[] {
  return colors.flatMap(([r, g, b]) => [r, g, b, alpha]);
}

describe("dominantHue", () => {
  it("returns null when every pixel is greyscale", () => {
    expect(dominantHue(pixels([[10, 10, 10], [128, 128, 128], [240, 240, 240]]))).toBeNull();
  });

  it("returns null for a fully transparent image", () => {
    expect(dominantHue(pixels([[255, 0, 0], [255, 0, 0]], 0))).toBeNull();
  });

  it("finds the hue of a saturated single-color image", () => {
    const palette = dominantHue(pixels([[220, 40, 40], [220, 40, 40], [210, 50, 45]]));
    expect(palette).not.toBeNull();
    expect(palette?.hue).toBeLessThan(10);
    expect(palette?.chroma).toBeGreaterThan(0.5);
  });

  it("ignores near-black and near-white pixels around a colored subject", () => {
    const colors: Array<[number, number, number]> = [];
    for (let i = 0; i < 40; i++) colors.push([4, 4, 6]);
    for (let i = 0; i < 40; i++) colors.push([252, 252, 250]);
    for (let i = 0; i < 10; i++) colors.push([40, 90, 220]);
    const palette = dominantHue(pixels(colors));
    expect(palette?.hue).toBeGreaterThan(200);
    expect(palette?.hue).toBeLessThan(250);
  });

  it("picks the more saturated hue when two colors share the frame", () => {
    const colors: Array<[number, number, number]> = [];
    for (let i = 0; i < 20; i++) colors.push([120, 130, 120]);
    for (let i = 0; i < 20; i++) colors.push([230, 150, 20]);
    const palette = dominantHue(pixels(colors));
    expect(palette?.hue).toBeGreaterThan(20);
    expect(palette?.hue).toBeLessThan(60);
  });
});
