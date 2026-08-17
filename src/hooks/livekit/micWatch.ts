"use client";

import { useEffect, useRef, useState } from "react";
import { RoomEvent, Track, TrackEvent } from "livekit-client";

import { MIC_STOPPED_MESSAGE } from "./capture";
import type { LiveKitCtx, MicCheckState } from "./context";

// Backgrounding, a call or an alarm mutes the capture and the OS often unmutes it a
// beat later on its own. Only a mute that outlives this is a mic the user has to restart.
const MIC_DEATH_GRACE_MS = 2500;

const isDeadTrack = (track: MediaStreamTrack | null): boolean => {
  if (!track) return true;
  return track.readyState !== "live" || track.muted;
};

/**
 * F4: nothing else in the app watches the track the room is actually hearing.
 *
 * The published mix is a MediaStreamDestination and never mutes, so the thing to watch
 * is the capture behind it: the singing mix's own mic stream while a turn is live, and
 * the LiveKit managed mic otherwise. A death that does not heal itself within the grace
 * becomes a state the user can tap, never a retry loop: iOS hands the mic back to a
 * gesture, and a silent re-acquire on a page it has backgrounded fails and costs a
 * Bluetooth route flip every time.
 */
export function useMicWatchdog(
  lk: LiveKitCtx,
  isMicEnabled: boolean,
  isConnected: boolean,
  captureDeviceId: string,
  mixMicStream: MediaStream | null,
  micCheckState: MicCheckState,
  restartMic: () => Promise<void>,
): void {
  const {
    roomRef,
    micCheckAbortRef,
    micCheckInFlightRef,
    mixMicStreamRef,
    mixOwnsMicRef,
    micStoppedRef,
    isSingingInFlightRef,
    isTogglingMicRef,
    setMicStopped,
    setSingingError,
  } = lk;

  const watchedRef = useRef<MediaStreamTrack | null>(null);
  const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // One automatic attempt per death, and only on the visibility return that follows it
  const autoTriedRef = useRef(false);
  const cameBackVisibleRef = useRef(false);
  const restartRef = useRef(restartMic);
  restartRef.current = restartMic;
  // Bumped when the grace expires on a track that has since been replaced, so the
  // listeners follow the live capture. Event-driven, so it settles instead of polling.
  const [rebindCount, setRebindCount] = useState(0);

  useEffect(() => {
    const clearGrace = () => {
      if (graceTimerRef.current) clearTimeout(graceTimerRef.current);
      graceTimerRef.current = null;
    };

    const markAlive = () => {
      clearGrace();
      autoTriedRef.current = false;
      if (!micStoppedRef.current) return;
      setMicStopped(false);
      // Only ours: a permission or capture error from the same turn has to survive this
      setSingingError((prev) => (prev === MIC_STOPPED_MESSAGE ? null : prev));
    };

    // A check that is not borrowing the singing capture released the managed mic itself,
    // so the track behind the mic is one the app ended on purpose, never an OS death.
    // The refs, not micCheckState: the release happens before the state moves, while the
    // check is still waiting on its own getUserMedia.
    const checkHoldsMic = (): boolean =>
      !mixOwnsMicRef.current && (micCheckAbortRef.current !== null || micCheckInFlightRef.current);

    const declareDead = () => {
      clearGrace();
      // An acquisition in flight has no capture yet by definition, and every one of
      // them ends in a state change that re-runs this effect with the real answer
      if (isSingingInFlightRef.current || isTogglingMicRef.current || checkHoldsMic()) return;
      if (!micStoppedRef.current) {
        setMicStopped(true);
        if (mixOwnsMicRef.current) setSingingError(MIC_STOPPED_MESSAGE);
      }
      // The one automatic recovery, and only on a return to a visible page: that is the
      // moment the OS hands the mic back, a hidden page cannot hold it on iOS at all,
      // and a death the user watched happen is theirs to retry from the control.
      if (!cameBackVisibleRef.current || autoTriedRef.current) return;
      cameBackVisibleRef.current = false;
      autoTriedRef.current = true;
      void restartRef.current();
    };

    // The refs, not the props: a re-acquire replaces the track without re-rendering
    const resolveTrack = (): MediaStreamTrack | null =>
      mixOwnsMicRef.current
        ? mixMicStreamRef.current?.getAudioTracks()[0] ?? null
        : roomRef.current?.localParticipant.getTrackPublication(Track.Source.Microphone)?.audioTrack
          ?.mediaStreamTrack ?? null;

    const armGrace = () => {
      if (graceTimerRef.current) return;
      graceTimerRef.current = setTimeout(() => {
        graceTimerRef.current = null;
        const current = resolveTrack();
        // The capture was replaced while the grace ran, which is a recovery, not a death
        if (current !== watchedRef.current) {
          setRebindCount((n) => n + 1);
          return;
        }
        if (isDeadTrack(current)) declareDead();
        else markAlive();
      }, MIC_DEATH_GRACE_MS);
    };

    // A mic the user turned off is not a mic that stopped
    if (!isMicEnabled) {
      watchedRef.current = null;
      markAlive();
      return;
    }

    // stopMicCheck puts the managed mic back and re-runs this effect through micCheckState
    if (checkHoldsMic()) {
      clearGrace();
      watchedRef.current = null;
      return;
    }

    const room = roomRef.current;
    // The LocalAudioTrack, not its media track: it survives the swaps below and is the
    // only thing that announces them.
    const managed = mixOwnsMicRef.current
      ? null
      : room?.localParticipant.getTrackPublication(Track.Source.Microphone)?.audioTrack ?? null;
    const track = resolveTrack();
    watchedRef.current = track;

    // LiveKit replaces the managed capture on paths that move none of this effect's
    // deps: unmute re-acquires a track whose readyState is "ended", and a mobile
    // foreground return restarts it outright. Both announce themselves, so the rebind
    // follows the events rather than a dep that happens to change at the same time.
    const rebindIfReplaced = () => {
      if (resolveTrack() !== watchedRef.current) setRebindCount((n) => n + 1);
    };

    const onVisible = () => {
      if (document.visibilityState !== "visible") {
        cameBackVisibleRef.current = false;
        return;
      }
      cameBackVisibleRef.current = true;
      // The grace runs again here: a device that unmutes itself on return does it a
      // beat later, and recovering a mic that was about to come back costs a re-capture
      if (isDeadTrack(watchedRef.current)) armGrace();
      else markAlive();
    };

    document.addEventListener("visibilitychange", onVisible);
    room?.on(RoomEvent.TrackMuted, rebindIfReplaced);
    room?.on(RoomEvent.TrackUnmuted, rebindIfReplaced);
    room?.on(RoomEvent.LocalTrackPublished, rebindIfReplaced);
    room?.on(RoomEvent.LocalTrackUnpublished, rebindIfReplaced);
    managed?.on(TrackEvent.Restarted, rebindIfReplaced);

    // Both death shapes share one listener set: a mic with nothing behind it has the
    // same one way out as a muted one, the visibility return that re-arms the grace.
    const unwatch = () => {
      clearGrace();
      document.removeEventListener("visibilitychange", onVisible);
      room?.off(RoomEvent.TrackMuted, rebindIfReplaced);
      room?.off(RoomEvent.TrackUnmuted, rebindIfReplaced);
      room?.off(RoomEvent.LocalTrackPublished, rebindIfReplaced);
      room?.off(RoomEvent.LocalTrackUnpublished, rebindIfReplaced);
      managed?.off(TrackEvent.Restarted, rebindIfReplaced);
    };

    if (!track) {
      // The mic is on with nothing behind it: a failed re-acquire looks exactly like this
      armGrace();
      return unwatch;
    }

    if (isDeadTrack(track)) armGrace();
    else markAlive();

    const onMute = () => armGrace();
    const onUnmute = () => markAlive();
    // stop() raises nothing, so "ended" is always the device or the OS taking the mic
    const onEnded = () => declareDead();

    track.addEventListener("mute", onMute);
    track.addEventListener("unmute", onUnmute);
    track.addEventListener("ended", onEnded);

    return () => {
      unwatch();
      track.removeEventListener("mute", onMute);
      track.removeEventListener("unmute", onUnmute);
      track.removeEventListener("ended", onEnded);
    };
  }, [isMicEnabled, isConnected, captureDeviceId, mixMicStream, micCheckState, rebindCount, setMicStopped, setSingingError]);
}
