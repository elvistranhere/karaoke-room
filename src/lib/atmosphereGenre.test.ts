import { describe, expect, it } from "vitest";
import { classifyGenre, GENRE_PRESETS, isGenre, normalizeText } from "./atmosphereGenre";

describe("normalizeText", () => {
  it("strips Vietnamese diacritics and the stroked d", () => {
    expect(normalizeText("Nhạc Trữ Tình Đặc Biệt")).toBe("nhac tru tinh dac biet");
  });
});

describe("classifyGenre", () => {
  it("falls back to the default preset with no signals", () => {
    expect(classifyGenre({})).toBe("default");
  });

  it("reads topic ids", () => {
    expect(classifyGenre({ topicIds: ["/m/0glt670"] })).toBe("hiphop");
    expect(classifyGenre({ topicIds: ["/m/0ggq0m"] })).toBe("classical");
  });

  it("reads wikipedia topic categories", () => {
    expect(classifyGenre({ topicCategories: ["https://en.wikipedia.org/wiki/Rock_music"] })).toBe("rock");
    expect(classifyGenre({ topicCategories: ["https://en.wikipedia.org/wiki/Pop_music"] })).toBe("pop");
  });

  it("ignores topic categories it does not know", () => {
    expect(classifyGenre({ topicCategories: ["https://en.wikipedia.org/wiki/Music"] })).toBe("default");
  });

  it("lets title keywords win over a generic category", () => {
    expect(
      classifyGenre({
        title: "Em Của Ngày Hôm Qua Remix",
        topicCategories: ["https://en.wikipedia.org/wiki/Pop_music"],
      }),
    ).toBe("dance");
  });

  it("matches Vietnamese keywords without diacritics", () => {
    expect(classifyGenre({ title: "Liên khúc nhạc trữ tình karaoke" })).toBe("folk");
    expect(classifyGenre({ title: "Nhạc sàn cực mạnh" })).toBe("dance");
  });

  it("does not read pop out of an unrelated word", () => {
    expect(classifyGenre({ title: "Popular karaoke night" })).toBe("default");
  });

  it("uses the channel when the title carries no signal", () => {
    expect(classifyGenre({ title: "Karaoke beat", channel: "Bolero Official" })).toBe("folk");
  });
});

describe("GENRE_PRESETS", () => {
  it("covers every genre with a faster pulse for higher energy", () => {
    expect(Object.keys(GENRE_PRESETS).every(isGenre)).toBe(true);
    expect(GENRE_PRESETS.dance.pulseMs).toBeLessThan(GENRE_PRESETS.pop.pulseMs);
    expect(GENRE_PRESETS.pop.pulseMs).toBeLessThan(GENRE_PRESETS.ballad.pulseMs);
    expect(GENRE_PRESETS.ballad.pulseMs).toBeLessThan(GENRE_PRESETS.classical.pulseMs);
  });
});
