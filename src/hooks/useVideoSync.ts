"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { computeSyncAction, computeTarget, isRateApplied } from "~/lib/syncMath";
import type { VideoState } from "~/types/room";
import type { YouTubePlayerHandle } from "./useYouTubePlayer";

const TICK_MS = 300;
const SINGER_BROADCAST_MS = 2000;
const SEEK_COOLDOWN_MS = 2000;
const PLAY_RETRY_MS = 1000;

const UNSTARTED = -1;
const PLAYING = 1;
const PAUSED = 2;
const BUFFERING = 3;
const CUED = 5;

interface UseVideoSyncParams {
  player: YouTubePlayerHandle;
  video: VideoState | null;
  videoRef: React.RefObject<VideoState | null>;
  isSinger: boolean;
  playerReady: boolean;
  serverOffsetRef: React.RefObject<number>;
  clockSyncedRef: React.RefObject<boolean>;
  syncOffsetMsRef: React.RefObject<number>;
  onBroadcast: (playing: boolean, videoTime: number, stalled?: boolean) => void;
}

interface UseVideoSyncReturn {
  broadcastNow: (playing: boolean, videoTime: number) => void;
  playbackBlocked: boolean;
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
  const blockedTicksRef = useRef(0);
  // iOS refuses sound playback without a fresh gesture; surfaced so the UI can ask for a tap
  const [playbackBlocked, setPlaybackBlocked] = useState(false);

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
        const singerState = player.getState();
        if (singerState !== PLAYING && singerState !== BUFFERING) return;
        const now = Date.now();
        if (now - lastBroadcastRef.current < SINGER_BROADCAST_MS) return;
        // A buffering player re-stamping its frozen time would drag every listener
        // backwards, so it beats "alive" instead: not the clock, but not dead either.
        if (singerState === BUFFERING) {
          lastBroadcastRef.current = now;
          onBroadcastRef.current(true, player.getTime(), true);
          return;
        }
        broadcastNow(true, player.getTime());
        return;
      }

      if (!current.playing) {
        blockedTicksRef.current = 0;
        setPlaybackBlocked(false);
        return;
      }
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
        // Retries without a gesture never succeed on iOS: after ~1.5s of a
        // should-be-playing player sitting idle, ask the user for a tap
        blockedTicksRef.current += 1;
        if (blockedTicksRef.current >= 5) setPlaybackBlocked(true);
      } else if (state === PLAYING) {
        blockedTicksRef.current = 0;
        setPlaybackBlocked(false);
      }

      // The iframe reports the applied rate a round trip later, so verify one tick on
      const requested = requestedRateRef.current;
      if (requested !== null) {
        requestedRateRef.current = null;
        if (!isRateApplied(requested, player.getPlaybackRate())) {
          rateSupportedRef.current = false;
          player.setPlaybackRate(1);
        }
      }

      const serverNow = Date.now() + serverOffsetRef.current;
      const target = computeTarget(
        current.videoTime,
        current.wallTime,
        serverNow,
        syncOffsetMsRef.current,
      );
      if (target === null) return;

      const decision = computeSyncAction(
        target,
        player.getTime(),
        rateSupportedRef.current,
        persistTicksRef.current,
      );
      persistTicksRef.current = decision.persistTicks;

      switch (decision.action.kind) {
        case "seek":
          // The cooldown lives in seekTo, so a suppressed seek still clears the persist count
          seekTo(decision.action.target);
          return;
        case "reset-rate":
          if (player.getPlaybackRate() !== 1) player.setPlaybackRate(1);
          return;
        case "nudge": {
          const rate = decision.action.rate;
          if (player.getPlaybackRate() !== rate) {
            player.setPlaybackRate(rate);
            requestedRateRef.current = rate;
          }
          return;
        }
        case "none":
          return;
      }
    };

    const interval = setInterval(tick, TICK_MS);
    return () => {
      clearInterval(interval);
      player.setPlaybackRate(1);
    };
  }, [playerReady, player, videoRef, serverOffsetRef, clockSyncedRef, syncOffsetMsRef, broadcastNow]);

  return { broadcastNow, playbackBlocked };
}
