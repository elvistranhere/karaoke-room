"use client";

import { useRef, useState } from "react";
import { LoaderCircle, Search } from "lucide-react";
import { parseYouTubeId, type YouTubeSearchResult } from "~/lib/youtube";
import { cacheGenre } from "~/lib/atmosphereAuto";
import { fetchYouTubeSearch } from "~/lib/apiBase";
import { track } from "~/lib/analytics";

interface VideoUrlInputProps {
  onLoad: (videoId: string) => void;
  label?: string;
  autoFocus?: boolean;
}

export function VideoUrlInput({ onLoad, label = "Load video", autoFocus = false }: VideoUrlInputProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<YouTubeSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const requestIdRef = useRef(0);

  const isUrl = parseYouTubeId(value) !== null;

  const pick = (result: YouTubeSearchResult | string) => {
    const videoId = typeof result === "string" ? result : result.videoId;
    if (typeof result !== "string") cacheGenre(videoId, result.genre);
    // A pasted link has no genre yet: the atmosphere provider looks that up later, and
    // the id and the title are exactly what analytics must never see.
    track("song_loaded", {
      genre: typeof result === "string" ? "unknown" : result.genre,
      has_search: typeof result !== "string",
    });
    setValue("");
    setResults(null);
    setError(null);
    onLoad(videoId);
  };

  const search = async (q: string) => {
    const requestId = ++requestIdRef.current;
    setSearching(true);
    setError(null);
    try {
      const response = await fetchYouTubeSearch({ q });
      const data = (await response.json()) as {
        results?: YouTubeSearchResult[];
        disabled?: boolean;
        error?: string;
      };
      if (requestId !== requestIdRef.current) return;
      if (data.disabled) {
        setError("Search is not set up yet, paste a YouTube link instead");
        return;
      }
      if (!response.ok || data.error) {
        setError("Search failed, try again or paste a link");
        return;
      }
      if (!data.results || data.results.length === 0) {
        setError("No results, try a different search");
        return;
      }
      setResults(data.results);
    } catch {
      if (requestId === requestIdRef.current) setError("Search failed, try again or paste a link");
    } finally {
      if (requestId === requestIdRef.current) setSearching(false);
    }
  };

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const videoId = parseYouTubeId(trimmed);
    if (videoId) {
      pick(videoId);
      return;
    }
    void search(trimmed);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg" style={{ background: "var(--color-dark-card)", color: "var(--color-primary)" }}>
          {searching ? <LoaderCircle size={15} className="animate-spin" /> : <Search size={15} />}
        </span>
        <input
          autoFocus={autoFocus}
          type="text"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(event) => { if (event.key === "Enter") submit(); }}
          placeholder="Search YouTube or paste a link"
          className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-xs outline-none transition-all focus:border-[var(--color-primary)]"
          style={{ background: "var(--color-dark-card)", borderColor: "var(--color-dark-border)", color: "var(--color-text-primary)" }}
          aria-label="Search YouTube or paste a link"
        />
        <button
          onClick={submit}
          disabled={!value.trim() || searching}
          className="shrink-0 cursor-pointer rounded-lg px-3 py-2 text-xs font-bold transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          style={{ fontFamily: "var(--font-display)", background: "var(--color-primary)", color: "#fff" }}
        >
          {isUrl ? label : "Search"}
        </button>
      </div>
      {error && (
        <p className="text-[11px]" style={{ color: "var(--color-danger)" }}>{error}</p>
      )}
      {results && (
        <div
          className="max-h-64 space-y-1 overflow-y-auto rounded-xl p-1.5"
          style={{ background: "var(--color-dark-card)", boxShadow: "var(--shadow-elevation-2)" }}
        >
          {results.map((result) => (
            <button
              key={result.videoId}
              onClick={() => pick(result)}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors hover:bg-white/5"
            >
              <span className="relative h-10 w-[71px] shrink-0 overflow-hidden rounded-md" style={{ background: "#000" }}>
                {result.thumbnail && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={result.thumbnail} alt="" className="h-full w-full object-cover outline outline-white/10 -outline-offset-1" loading="lazy" />
                )}
                {result.duration && (
                  <span className="absolute bottom-0.5 right-0.5 rounded px-1 text-[9px] tabular-nums" style={{ background: "rgba(0,0,0,0.8)", color: "#fff" }}>
                    {result.duration}
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs" style={{ color: "var(--color-text-primary)" }}>{result.title}</span>
                <span className="block truncate text-[10px]" style={{ color: "var(--color-text-muted)" }}>{result.channel}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
