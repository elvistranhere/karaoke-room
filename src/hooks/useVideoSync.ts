"use client";

import { useCallback, useEffect, useRef } from "react";
import type { VideoState } from "~/types/room";
import type { YouTubePlayerHandle } from "./useYouTubePlayer";

const TICK_MS = 300;
const SINGER_BROADCAST_MS = 2000;
const DEAD_ZONE_S = 0.05;
const SEEK_THRESHOLD_S = 1.5;
const SEEK_COOLDOWN_MS = 2000;
const PLAY_RETRY_MS = 1000;
const NUDGE_UP = 1.05;
const NUDGE_DOWN = 0.95;
const RATE_TOLERANCE = 0.01;
const PERSIST_DRIFT_S = 0.35;
const PERSIST_TICKS = 8;

const UNSTARTED = -1;
const PLAYING = 1;
const PAUSED = 2;
const CUED = 5;
const PERSIST_DRIFT_NO_RATE_S = 0.15;

interface UseVideoSyncParams {
  player: YouTubePlayerHandle;
  video: VideoState | null;
  videoRef: React.RefObject<VideoState | null>;
  isSinger: boolean;
  playerReady: boolean;
  serverOffsetRef: React.RefObject<number>;
  clockSyncedRef: React.RefObject<boolean>;
  syncOffsetMsRef: React.RefObject<number>;
  onBroadcast: (playing: boolean, videoTime: number) => void;
}

interface UseVideoSyncReturn {
  broadcastNow: (playing: boolean, videoTime: number) => void;
}

// Keeps every client lined up with the singer's clock. All state lives in refs so
// the correction loop never re-renders the player.
export function useVideoSync({
  player,
  video,
  videoRef,
  isSinger,
  playerReady,
  serverOffsetRef,
  clockSyncedRef,
  syncOffsetMsRef,
  onBroadcast,
}: UseVideoSyncParams): UseVideoSyncReturn {
  const isSingerRef = useRef(isSinger);
  isSingerRef.current = isSinger;
  const onBroadcastRef = useRef(onBroadcast);
  onBroadcastRef.current = onBroadcast;
  const rateSupportedRef = useRef(true);
  const requestedRateRef = useRef<number | null>(null);
  const appliedLoadRef = useRef<string | null>(null);
  const lastSeekAtRef = useRef(0);
  const lastPlayAtRef = useRef(0);
  const lastBroadcastRef = useRef(0);
  const persistTicksRef = useRef(0);

  const videoId = video?.videoId ?? null;
  const playing = video?.playing ?? false;
  const loadedAt = video?.loadedAt ?? 0;

  const broadcastNow = useCallback((nextPlaying: boolean, videoTime: number) => {
    lastBroadcastRef.current = Date.now();
    onBroadcastRef.current(nextPlaying, videoTime);
  }, []);

  // Load whenever the singer picks a video, including the same one again
  useEffect(() => {
    if (!playerReady || !videoId) return;
    const signature = `${videoId}:${loadedAt}`;
    if (appliedLoadRef.current === signature) return;
    appliedLoadRef.current = signature;

    const current = videoRef.current;
    // Without a clock sample the elapsed term would be pure local skew, so skip it
    const elapsed = current?.playing && clockSyncedRef.current
      ? (Date.now() + serverOffsetRef.current - current.wallTime) / 1000
      : 0;
    const offset = isSingerRef.current ? 0 : syncOffsetMsRef.current / 1000;
    const startSeconds = Math.max(0, (current?.videoTime ?? 0) + elapsed - offset);
    rateSupportedRef.current = true;
    requestedRateRef.current = null;
    player.load(videoId, startSeconds, current?.playing ?? false);
  }, [playerReady, videoId, loadedAt, player, videoRef, serverOffsetRef, clockSyncedRef]);

  // Follow play/pause transitions, and stop when the stage clears
  useEffect(() => {
    if (!playerReady) return;
    if (videoId && playing) player.play();
    else player.pause();
  }, [playerReady, videoId, playing, player]);

  useEffect(() => {
    if (!playerReady) return;

    const seekTo = (target: number) => {
      const now = Date.now();
      // A seek costs a rebuffer, which itself creates drift: never chase it back to back
      if (now - lastSeekAtRef.current < SEEK_COOLDOWN_MS) return;
      lastSeekAtRef.current = now;
      player.setPlaybackRate(1);
      requestedRateRef.current = null;
      player.seek(target);
    };

    const tick = () => {
      const current = videoRef.current;
      if (!current) return;

      if (isSingerRef.current) {
        if (!current.playing) return;
        // A buffering or stalled player would re-stamp a frozen time and drag
        // every listener backwards, so only a genuinely playing player is the clock
        if (player.getState() !== PLAYING) return;
        const now = Date.now();
        if (now - lastBroadcastRef.current < SINGER_BROADCAST_MS) return;
        broadcastNow(true, player.getTime());
        return;
      }

      if (!current.playing) return;
      if (player.getLoadedVideoId() !== current.videoId) return;
      if (!clockSyncedRef.current) {
        // Frozen correction is fine during an outage; an active nudge is not
        if (player.getPlaybackRate() !== 1) player.setPlaybackRate(1);
        return;
      }

      const state = player.getState();
      if (state === PAUSED || state === UNSTARTED || state === CUED) {
        const now = Date.now();
        if (now - lastPlayAtRef.current >= PLAY_RETRY_MS) {
          lastPlayAtRef.current = now;
          player.play();
        }
      }

      // The iframe reports the applied rate a round trip later, so verify one tick on
      const requested = requestedRateRef.current;
      if (requested !== null) {
        requestedRateRef.current = null;
        if (Math.abs(player.getPlaybackRate() - requested) > RATE_TOLERANCE) {
          rateSupportedRef.current = false;
          player.setPlaybackRate(1);
        }
      }

      const serverNow = Date.now() + serverOffsetRef.current;
      const rawTarget = current.videoTime
        + (serverNow - current.wallTime) / 1000
        - syncOffsetMsRef.current / 1000;
      if (!Number.isFinite(rawTarget)) return;
      // Negative means the delayed timeline has not reached 0 yet; correcting
      // toward 0 beats abandoning correction for the first offset-worth of song
      const target = Math.max(0, rawTarget);

      const drift = target - player.getTime();
      if (Math.abs(drift) >= SEEK_THRESHOLD_S) {
        persistTicksRef.current = 0;
        seekTo(target);
        return;
      }
      if (Math.abs(drift) < DEAD_ZONE_S) {
        persistTicksRef.current = 0;
        if (player.getPlaybackRate() !== 1) player.setPlaybackRate(1);
        return;
      }

      // Nudging moves ~15ms per tick, so drift that stays large for seconds means it
      // is not working (no rate control, or a big post-ad gap): one cooled-down seek.
      // Without rate control the seek is the only tool, so it engages sooner.
      const persistThreshold = rateSupportedRef.current ? PERSIST_DRIFT_S : PERSIST_DRIFT_NO_RATE_S;
      persistTicksRef.current = Math.abs(drift) >= persistThreshold ? persistTicksRef.current + 1 : 0;
      if (persistTicksRef.current >= PERSIST_TICKS) {
        persistTicksRef.current = 0;
        seekTo(target);
        return;
      }
      if (!rateSupportedRef.current) return;

      // YouTube quantizes rates to 0.05 steps, so only ever ask for the two endpoints:
      // a fractional request like 1.012 snaps to 1.0 and reads back as unsupported.
      const rate = drift > 0 ? NUDGE_UP : NUDGE_DOWN;
      if (player.getPlaybackRate() !== rate) {
        player.setPlaybackRate(rate);
        requestedRateRef.current = rate;
      }
    };

    const interval = setInterval(tick, TICK_MS);
    return () => {
      clearInterval(interval);
      player.setPlaybackRate(1);
    };
  }, [playerReady, player, videoRef, serverOffsetRef, clockSyncedRef, syncOffsetMsRef, broadcastNow]);

  return { broadcastNow };
}
