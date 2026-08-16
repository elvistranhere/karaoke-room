export type Genre =
  | "ballad"
  | "pop"
  | "hiphop"
  | "rock"
  | "dance"
  | "lofi"
  | "folk"
  | "classical"
  | "default";

export interface GenrePreset {
  label: string;
  pulseMs: number;
  saturation: number;
  contrast: number;
  warmth: number;
  spread: number;
  lift: number;
}

export const GENRE_PRESETS: Record<Genre, GenrePreset> = {
  ballad: { label: "Ballad", pulseMs: 5200, saturation: 0.72, contrast: 0.3, warmth: 0.35, spread: 18, lift: 0.4 },
  pop: { label: "Pop", pulseMs: 3000, saturation: 1.1, contrast: 0.62, warmth: 0.1, spread: 34, lift: 0.52 },
  hiphop: { label: "Hip hop", pulseMs: 2600, saturation: 0.96, contrast: 0.8, warmth: -0.05, spread: 26, lift: 0.36 },
  rock: { label: "Rock", pulseMs: 2200, saturation: 1.22, contrast: 0.9, warmth: 0.2, spread: 42, lift: 0.46 },
  dance: { label: "Dance", pulseMs: 1700, saturation: 1.38, contrast: 1, warmth: -0.25, spread: 54, lift: 0.58 },
  lofi: { label: "Lo-fi", pulseMs: 6000, saturation: 0.58, contrast: 0.2, warmth: 0.3, spread: 14, lift: 0.34 },
  folk: { label: "Folk", pulseMs: 4600, saturation: 0.7, contrast: 0.35, warmth: 0.55, spread: 22, lift: 0.42 },
  classical: { label: "Classical", pulseMs: 7000, saturation: 0.54, contrast: 0.25, warmth: 0.15, spread: 12, lift: 0.38 },
  default: { label: "Auto", pulseMs: 3600, saturation: 0.9, contrast: 0.5, warmth: 0, spread: 30, lift: 0.46 },
};

const GENRES = Object.keys(GENRE_PRESETS) as Genre[];

export function isGenre(value: unknown): value is Genre {
  return typeof value === "string" && (GENRES as string[]).includes(value);
}

const TOPIC_ID_GENRES: Record<string, Genre> = {
  "/m/0glt670": "hiphop",
  "/m/06by7": "rock",
  "/m/03lty": "rock",
  "/m/02lkt": "dance",
  "/m/0ggq0m": "classical",
  "/m/01lyv": "folk",
  "/m/02mscn": "folk",
  "/m/05rwpb": "lofi",
  "/m/03_d0": "lofi",
  "/m/0gywn": "ballad",
  "/m/06j64v": "pop",
  "/m/06cqb": "pop",
  "/m/028sqc": "pop",
  "/m/0g293": "dance",
};

const TOPIC_CATEGORY_GENRES: Record<string, Genre> = {
  hip_hop_music: "hiphop",
  rock_music: "rock",
  heavy_metal: "rock",
  punk_rock: "rock",
  electronic_music: "dance",
  classical_music: "classical",
  opera: "classical",
  country_music: "folk",
  folk_music: "folk",
  christian_music: "folk",
  independent_music: "lofi",
  jazz: "lofi",
  soul_music: "ballad",
  rhythm_and_blues: "pop",
  pop_music: "pop",
  reggae: "pop",
  music_of_asia: "pop",
  music_of_latin_america: "dance",
};

const KEYWORD_RULES: Array<{ genre: Genre; test: RegExp }> = [
  { genre: "lofi", test: /\blo-?fi\b|\bchill\s?hop\b|\bacoustic\b|\bunplugged\b|nhac chill/ },
  { genre: "classical", test: /\bclassical\b|\borchestra|\bsymphony\b|\binstrumental\b|hoa tau|nhac khong loi/ },
  { genre: "dance", test: /\bremix\b|\bedm\b|\bdance\b|\bdisco\b|\bhouse mix\b|\bmashup\b|vinahouse|nhac san/ },
  { genre: "hiphop", test: /\brap\b|\bhip[- ]?hop\b|\bfreestyle\b|\bdiss\b|nhac rap/ },
  { genre: "rock", test: /\brock\b|\bmetal\b|\bpunk\b/ },
  { genre: "folk", test: /\bbolero\b|\bfolk\b|\bcountry\b|tru tinh|dan ca|que huong|cai luong|nhac vang/ },
  { genre: "ballad", test: /\bballad\b|\bslow\b|\blullaby\b|nhac buon|tam trang/ },
  { genre: "pop", test: /\bpop\b|\bk-?pop\b|\bv-?pop\b|nhac tre|usuk/ },
];

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

function categorySlug(url: string): string {
  const tail = url.split("/").pop() ?? "";
  return decodeURIComponent(tail).toLowerCase();
}

export interface GenreSignals {
  topicIds?: string[];
  topicCategories?: string[];
  title?: string;
  channel?: string;
}

export function classifyGenre(signals: GenreSignals): Genre {
  const text = normalizeText(`${signals.title ?? ""} ${signals.channel ?? ""}`);
  for (const rule of KEYWORD_RULES) {
    if (rule.test.test(text)) return rule.genre;
  }

  for (const topicId of signals.topicIds ?? []) {
    const genre = TOPIC_ID_GENRES[topicId];
    if (genre) return genre;
  }

  for (const category of signals.topicCategories ?? []) {
    const genre = TOPIC_CATEGORY_GENRES[categorySlug(category)];
    if (genre) return genre;
  }

  return "default";
}
