"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const IFRAME_API_SRC = "https://www.youtube.com/iframe_api";
const EMBED_BLOCKED_CODES = new Set([101, 150]);

let apiPromise: Promise<typeof YT> | null = null;

function loadIframeApi(): Promise<typeof YT> {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<typeof YT>((resolve) => {
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT) resolve(window.YT);
    };
    if (!document.querySelector(`script[src="${IFRAME_API_SRC}"]`)) {
      const script = document.createElement("script");
      script.src = IFRAME_API_SRC;
      document.head.appendChild(script);
    }
  });
  return apiPromise;
}

export interface YouTubePlayerHandle {
  load: (videoId: string, startSeconds: number, autoplay: boolean) => void;
  play: () => void;
  pause: () => void;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
  setPlaybackRate: (rate: number) => void;
  getPlaybackRate: () => number;
  getState: () => number;
  getTime: () => number;
  getDuration: () => number;
  getTitle: () => string | null;
  getLoadedVideoId: () => string | null;
  isReady: () => boolean;
}

interface UseYouTubePlayerParams {
  onStateChange?: (state: number) => void;
}

interface UseYouTubePlayerReturn {
  mountRef: React.RefObject<HTMLDivElement | null>;
  player: YouTubePlayerHandle;
  apiReady: boolean;
  ready: boolean;
  errorCode: number | null;
  embedBlocked: boolean;
  createPlayer: () => void;
  clearError: () => void;
}

export function useYouTubePlayer({ onStateChange }: UseYouTubePlayerParams = {}): UseYouTubePlayerReturn {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YT.Player | null>(null);
  const readyRef = useRef(false);
  const creatingRef = useRef(false);
  const loadedVideoIdRef = useRef<string | null>(null);
  const pendingLoadRef = useRef<{ videoId: string; startSeconds: number; autoplay: boolean } | null>(null);
  const pendingVolumeRef = useRef<number | null>(null);
  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;

  const [apiReady, setApiReady] = useState(false);
  const [ready, setReady] = useState(false);
  const [errorCode, setErrorCode] = useState<number | null>(null);

  const applyLoad = useCallback((videoId: string, startSeconds: number, autoplay: boolean) => {
    const instance = playerRef.current;
    if (!instance) return;
    loadedVideoIdRef.current = videoId;
    setErrorCode(null);
    if (autoplay) {
      instance.loadVideoById(videoId, startSeconds);
    } else {
      instance.cueVideoById(videoId, startSeconds);
    }
    if (pendingVolumeRef.current !== null) {
      instance.setVolume(pendingVolumeRef.current);
    }
  }, []);

  const instantiate = useCallback((api: typeof YT) => {
    if (!mountRef.current) {
      creatingRef.current = false;
      return;
    }
    const host = document.createElement("div");
    host.style.width = "100%";
    host.style.height = "100%";
    mountRef.current.appendChild(host);

    playerRef.current = new api.Player(host, {
      width: "100%",
      height: "100%",
      playerVars: {
        controls: 0,
        disablekb: 1,
        fs: 0,
        rel: 0,
        iv_load_policy: 3,
        playsinline: 1,
        modestbranding: 1,
        origin: window.location.origin,
      },
      events: {
        onReady: () => {
          readyRef.current = true;
          setReady(true);
          // Safari has no inert support, so drop the frame from the tab order directly
          playerRef.current?.getIframe()?.setAttribute("tabindex", "-1");
          const pending = pendingLoadRef.current;
          pendingLoadRef.current = null;
          if (pending) applyLoad(pending.videoId, pending.startSeconds, pending.autoplay);
          else if (pendingVolumeRef.current !== null) playerRef.current?.setVolume(pendingVolumeRef.current);
        },
        onStateChange: (event) => {
          onStateChangeRef.current?.(event.data);
        },
        onError: (event) => {
          setErrorCode(event.data);
        },
      },
    });
  }, [applyLoad]);

  // Fetch the API ahead of the unlock click so the player can be built synchronously
  useEffect(() => {
    let active = true;
    void loadIframeApi().then(() => { if (active) setApiReady(true); });
    return () => { active = false; };
  }, []);

  // Must run inside a user gesture: user activation propagates to the iframe only
  // if it is created while the gesture is still live, which is what unlocks autoplay.
  const createPlayer = useCallback(() => {
    if (playerRef.current || creatingRef.current) return;
    if (!mountRef.current) return;
    creatingRef.current = true;

    const api = window.YT;
    if (api?.Player) {
      instantiate(api);
      return;
    }
    void loadIframeApi().then(instantiate);
  }, [instantiate]);

  useEffect(() => {
    return () => {
      playerRef.current?.destroy();
      playerRef.current = null;
      readyRef.current = false;
      creatingRef.current = false;
      loadedVideoIdRef.current = null;
    };
  }, []);

  const handleRef = useRef<YouTubePlayerHandle>({
    load: (videoId, startSeconds, autoplay) => {
      if (!readyRef.current) {
        pendingLoadRef.current = { videoId, startSeconds, autoplay };
        loadedVideoIdRef.current = videoId;
        return;
      }
      applyLoad(videoId, startSeconds, autoplay);
    },
    play: () => { playerRef.current?.playVideo(); },
    pause: () => { playerRef.current?.pauseVideo(); },
    seek: (seconds) => { playerRef.current?.seekTo(Math.max(0, seconds), true); },
    setVolume: (volume) => {
      const clamped = Math.max(0, Math.min(100, Math.round(volume)));
      pendingVolumeRef.current = clamped;
      if (readyRef.current) playerRef.current?.setVolume(clamped);
    },
    setPlaybackRate: (rate) => { playerRef.current?.setPlaybackRate(rate); },
    getPlaybackRate: () => playerRef.current?.getPlaybackRate() ?? 1,
    getState: () => playerRef.current?.getPlayerState() ?? -1,
    getTime: () => playerRef.current?.getCurrentTime() ?? 0,
    getDuration: () => playerRef.current?.getDuration() ?? 0,
    getTitle: () => playerRef.current?.getVideoData()?.title || null,
    getLoadedVideoId: () => loadedVideoIdRef.current,
    isReady: () => readyRef.current,
  });

  const clearError = useCallback(() => setErrorCode(null), []);

  return {
    mountRef,
    player: handleRef.current,
    apiReady,
    ready,
    errorCode,
    embedBlocked: errorCode !== null && EMBED_BLOCKED_CODES.has(errorCode),
    createPlayer,
    clearError,
  };
}
