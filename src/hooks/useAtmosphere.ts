"use client";

import { useEffect, useRef } from "react";
import {
  applyAtmosphere,
  IDLE_TOKENS,
  primeAtmosphereRoot,
  readAtmospherePref,
  registerAtmosphereProperties,
} from "~/lib/atmosphere";
import { getAtmosphereProvider } from "~/lib/atmosphereProviders";

interface UseAtmosphereOptions {
  videoId: string | null;
  songName: string | null;
}

export function useAtmosphere({ videoId, songName }: UseAtmosphereOptions): void {
  const songNameRef = useRef(songName);
  songNameRef.current = songName;

  useEffect(() => {
    registerAtmosphereProperties();
    primeAtmosphereRoot(document.documentElement);
    return () => {
      applyAtmosphere(document.documentElement, IDLE_TOKENS);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const provider = getAtmosphereProvider(readAtmospherePref());
    const controller = new AbortController();

    void provider
      .resolve(videoId ? { videoId, songName: songNameRef.current } : null, controller.signal)
      .then((tokens) => {
        if (!controller.signal.aborted) applyAtmosphere(root, tokens);
      })
      .catch(() => {
        if (!controller.signal.aborted) applyAtmosphere(root, IDLE_TOKENS);
      });

    return () => controller.abort();
  }, [videoId]);
}
