"use client";

import { useCallback, useEffect, useRef } from "react";
import { AudioPresets, Track, type Room } from "livekit-client";

import { createEffectChain, type VoiceEffect } from "~/lib/voiceEffects";
import { writePref } from "~/lib/prefs";
import { beginAudioCapture, endAudioCapture, resetAudioSession } from "~/lib/audioSession";
import {
  resolveCaptureProfile,
  toMediaTrackConstraints,
  type CaptureProfile,
} from "~/lib/audioProfile";
import { classifyMicError, MIC_TOGGLE_ERRORS, START_SINGING_ERRORS } from "~/lib/micErrors";
import { applyNoiseCancellationInPlace, capturesAreExclusive, stopStream } from "~/lib/micCapture";
import type { LiveKitCtx } from "./context";
import { createLogger } from "~/lib/logger";

const log = createLogger("LiveKit");

// The web driver's translation of a profile preset. LiveKit's "music" preset is what
// the talking profile has always published at, so "voice" maps onto it rather than
// onto speech.
const LIVEKIT_PRESETS = {
  voice: AudioPresets.music,
  musicStereo: AudioPresets.musicHighQualityStereo,
  musicHQ: AudioPresets.musicHighQuality,
};

export function toAudioPreset(preset: CaptureProfile["preset"]) {
  return LIVEKIT_PRESETS[preset];
}

// The singer publishes this alongside LiveKit's muted managed mic, so both carry
// Track.Source.Microphone and only the name tells them apart.
export const VOICE_TRACK_NAME = "karaoke-voice";

export const MIC_ON_PREF_KEY = "karaoke-mic-on";

// The one copy of the wording, so the watchdog can tell its own message apart from a
// permission error when it clears the singer's error surface.
export const MIC_STOPPED_MESSAGE = "Mic stopped, tap to restart";

/**
 * Release the LiveKit managed capture, rather than only muting it.
 *
 * LiveKit leaves the media track live on mute by default (stopMicTrackOnMute is off so
 * a Bluetooth link does not flip on every mute), which means a mute alone still holds
 * the device's one capture unit. Its unmute path re-acquires any track whose readyState
 * is "ended", so stopping it here is exactly what LiveKit does for itself and it comes
 * back on the next setMicrophoneEnabled(true).
 */
async function releaseManagedMic(room: Room): Promise<void> {
  const managed = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.audioTrack;
  await room.localParticipant.setMicrophoneEnabled(false);
  managed?.mediaStreamTrack.stop();
}

/**
 * Drop what is left of a singing capture that is already stopped.
 *
 * A release-first swap that then fails to re-acquire has no capture left, and a stopped
 * MediaStreamTrack raises no event, so nothing downstream would ever notice on its own.
 * Every other teardown lands in mixMicStreamState, which is where a borrowing mic check,
 * the watchdog and the add-to-mix branch all read the mix capture from, so a death has
 * to land there too rather than leaving a dead stream published as the live one.
 */
export function dropMixCapture(lk: LiveKitCtx): void {
  lk.effectChainRef.current?.cleanup();
  lk.effectChainRef.current = null;
  lk.mixMicSourceRef.current?.disconnect();
  lk.mixMicSourceRef.current = null;
  lk.mixMicGainRef.current?.disconnect();
  lk.mixMicGainRef.current = null;
  lk.mixMicStreamRef.current = null;
  lk.setMixMicStreamState(null);
}

// --- Hot-swap NC while singing ---
// The turn owns one capture: NC moves on the open track, and only a device that
// refuses that gets a re-capture, released before it is re-acquired on iOS.

export function useSingingNCHotSwap(
  lk: LiveKitCtx,
  singingNC: boolean,
  captureDeviceId: string,
): void {
  const {
    prevSingingNCRef,
    micModeRef,
    talkingNCRef,
    mixCtxRef,
    mixMicSourceRef,
    mixMicStreamRef,
    mixPubRef,
    effectChainRef,
    setMicStopped,
    setMixMicStreamState,
    setSingingError,
  } = lk;

  useEffect(() => {
    if (prevSingingNCRef.current === singingNC) return;
    prevSingingNCRef.current = singingNC;

    // Only hot-swap if the singing mix is live
    if (!mixPubRef.current || !mixMicStreamRef.current || !mixCtxRef.current) return;

    log.debug("Hot-swapping NC while singing:", singingNC ? "ON" : "OFF");
    const ctx = mixCtxRef.current;
    void (async () => {
      const nc = singingNC;
      // The free swap: no second capture, no gap, and no Bluetooth route flip
      if (await applyNoiseCancellationInPlace(mixMicStreamRef.current, nc)) {
        log.debug("Mix mic NC applied in place:", nc ? "ON" : "OFF");
        return;
      }
      // iOS holds one capture unit per device, and a second getUserMedia mutes the
      // track the room is listening to for good. A gap is the cheaper failure.
      const releaseFirst = capturesAreExclusive();
      const oldStream = mixMicStreamRef.current;
      if (releaseFirst) stopStream(oldStream);
      try {
        const profile = resolveCaptureProfile({
          purpose: "singing",
          micMode: micModeRef.current,
          talkingNC: talkingNCRef.current,
          singingNC: nc,
        });
        const newStream = await navigator.mediaDevices.getUserMedia({
          audio: toMediaTrackConstraints(profile, captureDeviceId),
        });

        // The turn can end while getUserMedia is pending; the fresh capture would
        // otherwise stay open with nothing left holding a reference to it.
        if (mixCtxRef.current !== ctx || !mixPubRef.current) {
          stopStream(newStream);
          return;
        }

        if (!releaseFirst) stopStream(oldStream);
        mixMicStreamRef.current = newStream; setMixMicStreamState(newStream);

        // Reconnect in the Web Audio graph
        mixMicSourceRef.current?.disconnect();
        const chain = effectChainRef.current;
        if (chain) {
          const newSource = ctx.createMediaStreamSource(newStream);
          newSource.connect(chain.input);
          mixMicSourceRef.current = newSource;
          log.debug("Mix mic re-captured with NC:", nc ? "ON" : "OFF");
        }
        // A mic check borrowing this capture follows the new stream off the state
        // write above, which is the one place every mix-capture change lands.
      } catch (err) {
        log.error("Error hot-swapping NC:", err);
        // The old capture is already gone on the release-first path and a stopped track
        // raises no event, so nothing downstream would ever notice the mic is dead.
        // The turn can also have ended while getUserMedia was pending, and its teardown
        // already released everything: nothing died that the user has to restart.
        if (!releaseFirst || mixCtxRef.current !== ctx || !mixPubRef.current) return;
        dropMixCapture(lk);
        setMicStopped(true);
        setSingingError(MIC_STOPPED_MESSAGE);
      }
    })();
  }, [singingNC, captureDeviceId]);
}

export interface CaptureApi {
  toggleMic: (target?: boolean) => Promise<void>;
  setMicMuted: (muted: boolean) => Promise<void>;
  restartMic: () => Promise<void>;
  setMixMicGain: (val: number) => void;
  setVoiceEffect: (effect: VoiceEffect) => void;
  setEffectWetDry: (wet: number) => void;
  startSinging: () => Promise<void>;
  stopSinging: () => void;
}

// --- Microphone and singing voice pipeline ---
// Mic runs through the voice effect chain into a MediaStreamDestination and is
// published as one LiveKit track. Music is played locally by every client.

export function useCapture(
  lk: LiveKitCtx,
  captureDeviceId: string,
  isSinging: boolean,
  isMyTurn: boolean,
  syncNCToRoom: () => void,
  stopMicCheck: () => void,
): CaptureApi {
  const {
    roomRef,
    micCheckAbortRef,
    micCheckGainRef,
    micCheckPrevMixGainRef,
    micCheckEffectChainRef,
    micCheckRestoreMicRef,
    mixCtxRef,
    mixDestRef,
    mixMicGainRef,
    mixMicSourceRef,
    mixMicStreamRef,
    mixPubRef,
    mixOwnsMicRef,
    mixMicGainValueRef,
    effectChainRef,
    isSingingInFlightRef,
    isTogglingMicRef,
    micIntentGenRef,
    micErrorTimerRef,
    isMicEnabledRef,
    micModeRef,
    talkingNCRef,
    singingNCRef,
    voiceEffectRef,
    effectWetDryRef,
    setError,
    setIsMicEnabled,
    setIsSinging,
    setSingingError,
    setMixMicStreamState,
    setVoiceEffectState,
    setEffectWetDryState,
  } = lk;

  const detachMicFromMix = useCallback(() => {
    if (!mixMicStreamRef.current) return;
    effectChainRef.current?.cleanup();
    effectChainRef.current = null;
    mixMicSourceRef.current?.disconnect();
    mixMicSourceRef.current = null;
    mixMicGainRef.current?.disconnect();
    mixMicGainRef.current = null;
    mixMicStreamRef.current.getTracks().forEach((t) => t.stop());
    mixMicStreamRef.current = null; setMixMicStreamState(null);
  }, []);

  // A request that lands mid-flight is queued, not dropped: dropping it meant a mute
  // clicked during the join auto-unmute silently left the mic live.
  const pendingMicStateRef = useRef<{ state: boolean; persist: boolean } | null>(null);
  const applyMicStateSelfRef = useRef<((state: boolean, persist: boolean) => Promise<void>) | null>(null);

  // persist is false for forced changes (deafen): only a deliberate toggle
  // may rewrite the join preference
  const applyMicState = useCallback(async (newState: boolean, persist: boolean) => {
    const room = roomRef.current;
    if (!room?.localParticipant) return;
    if (isTogglingMicRef.current) {
      pendingMicStateRef.current = { state: newState, persist };
      return;
    }

    isTogglingMicRef.current = true;
    // play-and-record has to be the session type before the capture opens, never after
    if (newState) beginAudioCapture("mic");
    try {
      log.debug("Setting mic enabled:", newState);

      // If the mix owns the mic, add/remove it there instead of the LiveKit managed
      // mic. mixOwnsMicRef, not mixPubRef: startSinging claims the mic before its
      // awaits, so a toggle mid-promotion cannot re-arm the managed mic on top.
      if (mixOwnsMicRef.current) {
        if (!mixCtxRef.current || !mixDestRef.current || !mixPubRef.current) {
          // startSinging is still building the pipeline; it reconciles this state
          isMicEnabledRef.current = newState;
        } else if (newState && !mixMicStreamRef.current) {
          // Add mic to mix
          const profile = resolveCaptureProfile({
            purpose: "singing",
            micMode: micModeRef.current,
            talkingNC: talkingNCRef.current,
            singingNC: singingNCRef.current,
          });
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: toMediaTrackConstraints(profile, captureDeviceId),
          });

          const ctx = mixCtxRef.current;
          const dest = mixDestRef.current;
          const micSource = ctx.createMediaStreamSource(stream);
          const micGain = ctx.createGain();
          micGain.gain.value = mixMicGainValueRef.current;

          const chain = createEffectChain(ctx, voiceEffectRef.current);
          chain.setWetDry?.(effectWetDryRef.current);
          micSource.connect(chain.input);
          chain.output.connect(micGain);
          micGain.connect(dest);

          mixMicSourceRef.current = micSource;
          mixMicGainRef.current = micGain;
          mixMicStreamRef.current = stream; setMixMicStreamState(stream);
          effectChainRef.current = chain;

          log.debug("Mic added to mix on the fly");
        } else if (!newState && mixMicStreamRef.current) {
          detachMicFromMix();
          log.debug("Mic removed from mix on the fly");
        }
        setIsMicEnabled(newState);
      } else {
        // Not singing - use LiveKit managed mic
        await room.localParticipant.setMicrophoneEnabled(newState);
        setIsMicEnabled(newState);
      }

      if (!newState) endAudioCapture("mic");
      if (persist) writePref(MIC_ON_PREF_KEY, newState ? "on" : "off");
      log.debug("Mic is now", newState ? "ON" : "OFF");
    } catch (err) {
      // The capture never opened, so releasing here cannot pin a live one to playback
      if (newState) endAudioCapture("mic");
      log.error("Mic error:", err);
      // A denied permission must not leave the button showing a live mic
      setIsMicEnabled(mixOwnsMicRef.current
        ? mixMicStreamRef.current !== null
        : room.localParticipant.isMicrophoneEnabled === true);
      const { message: msg, autoClearMs } = classifyMicError(err, MIC_TOGGLE_ERRORS);
      setError(msg);
      // Clear previous timer, schedule new one - only one timer active at a time
      if (micErrorTimerRef.current) clearTimeout(micErrorTimerRef.current);
      if (autoClearMs !== null) {
        micErrorTimerRef.current = setTimeout(() => {
          setError((prev) => prev === msg ? null : prev);
          micErrorTimerRef.current = null;
        }, autoClearMs);
      }
    } finally {
      isTogglingMicRef.current = false;
      const pending = pendingMicStateRef.current;
      pendingMicStateRef.current = null;
      if (pending && pending.state !== newState) {
        void applyMicStateSelfRef.current?.(pending.state, pending.persist);
      }
    }
  }, [captureDeviceId, detachMicFromMix]);
  applyMicStateSelfRef.current = applyMicState;

  // Explicit target, not a toggle: the caller passes the state its label promised,
  // so a click landing mid-flight cannot invert the user's intent off a stale ref.
  const toggleMic = useCallback(async (target?: boolean) => {
    micIntentGenRef.current++;
    await applyMicState(target ?? !isMicEnabledRef.current, true);
  }, [applyMicState]);

  // The one recovery for a mic the OS stopped, run from the user's tap or from the
  // watchdog's single automatic attempt. It re-uses the acquisition paths that already
  // exist instead of adding a third: applyMicState(false) releases whichever capture is
  // live, applyMicState(true) re-acquires it, the singing one through the add-to-mix
  // branch and the managed one through LiveKit's own restart of an ended track.
  const restartMic = useCallback(async () => {
    if (!isMicEnabledRef.current) {
      await applyMicState(true, false);
      return;
    }
    const intent = micIntentGenRef.current;
    if (!mixOwnsMicRef.current) {
      // LiveKit only re-acquires on unmute when the media track has ended. A track the
      // OS merely muted would come back still muted, so the release has to be explicit.
      roomRef.current?.localParticipant
        .getTrackPublication(Track.Source.Microphone)?.audioTrack?.mediaStreamTrack.stop();
    }
    await applyMicState(false, false);
    // The release above is the one window where a mute the user asks for looks exactly
    // like the one this recovery made, so the re-enable answers to their intent rather
    // than to the state it left behind: never auto-unmute someone who muted themselves.
    if (micIntentGenRef.current !== intent) return;
    await applyMicState(true, false);
  }, [applyMicState]);

  // Force mute/unmute - used by deafen and the join gesture, and handles both the
  // singing and idle paths. Unlike toggleMic, it sets a specific state.
  const setMicMuted = useCallback(async (muted: boolean) => {
    // Before the already-in-state check: a restart in flight has the mic off either way,
    // so the bump is what tells the two apart, not the state it happens to read.
    micIntentGenRef.current++;
    const currentlyEnabled = isMicEnabledRef.current;
    if ((muted && !currentlyEnabled) || (!muted && currentlyEnabled)) return; // already in desired state
    await applyMicState(!muted, false);
  }, [applyMicState]);

  const cleanupMix = useCallback(() => {
    mixOwnsMicRef.current = false;
    effectChainRef.current?.cleanup();
    effectChainRef.current = null;
    mixMicSourceRef.current?.disconnect();
    mixMicStreamRef.current?.getTracks().forEach((t) => t.stop());
    mixMicStreamRef.current = null; setMixMicStreamState(null);
    mixMicSourceRef.current = null;
    mixMicGainRef.current = null;
    mixDestRef.current = null;
    if (mixCtxRef.current?.state !== "closed") {
      void mixCtxRef.current?.close();
    }
    mixCtxRef.current = null;
    // Last: the mic stream above is already stopped, and any other owner still
    // holding the session (the managed mic, a mic check) keeps play-and-record.
    endAudioCapture("singing");
  }, []);

  // Expose the published voice gain so the singer can set their own level
  const setMixMicGain = useCallback((val: number) => {
    mixMicGainValueRef.current = val;
    if (micCheckAbortRef.current) {
      // During a mic check the slider drives the loopback; the published gain is
      // silenced, so stash the value for restore instead of un-silencing it.
      if (micCheckGainRef.current) micCheckGainRef.current.gain.value = val;
      if (micCheckPrevMixGainRef.current !== null) micCheckPrevMixGainRef.current = val;
      return;
    }
    if (mixMicGainRef.current) mixMicGainRef.current.gain.value = val;
  }, []);

  // Swap voice effect live while singing
  const setVoiceEffect = useCallback((effect: VoiceEffect) => {
    writePref("karaoke-voice-effect", effect);
    setVoiceEffectState(effect);
    voiceEffectRef.current = effect;
    const ctx = mixCtxRef.current;
    const micSource = mixMicSourceRef.current;
    const micGain = mixMicGainRef.current;
    if (!ctx || !micSource || !micGain) return; // not singing, will apply on the next turn

    // Tear down old chain
    effectChainRef.current?.cleanup();
    micSource.disconnect();

    // Create new chain with current wet/dry
    const chain = createEffectChain(ctx, effect);
    chain.setWetDry?.(effectWetDryRef.current);
    micSource.connect(chain.input);
    chain.output.connect(micGain);
    effectChainRef.current = chain;

    log.debug("Voice effect switched to:", effect);
  }, []);

  const setEffectWetDry = useCallback((wet: number) => {
    const normalizedWet = Math.min(1, Math.max(0, wet));
    effectWetDryRef.current = normalizedWet;
    setEffectWetDryState(normalizedWet);
    writePref("karaoke-effect-wetdry", String(normalizedWet));
    effectChainRef.current?.setWetDry?.(normalizedWet);
    // Also apply to mic check effect chain if monitoring
    micCheckEffectChainRef.current?.setWetDry?.(normalizedWet);
  }, []);

  const startSinging = useCallback(async () => {
    const room = roomRef.current;
    if (!room?.localParticipant || isSingingInFlightRef.current) {
      if (!room) setSingingError("Not connected");
      return;
    }

    isSingingInFlightRef.current = true;
    // Claimed before the first await so no other path re-arms the managed mic
    // while the pipeline is still being built.
    mixOwnsMicRef.current = true;
    beginAudioCapture("singing");
    try {
      // One capture per turn: the managed mic is released before the singing capture
      // opens, never alongside it. Muting it after would leave both open across the
      // whole acquisition, which is the window iOS answers by muting the older one.
      await releaseManagedMic(room);

      // Taking the stage never overrides an explicit mute: the pipeline is built
      // either way, and the detach after publish keeps a muted singer silent.
      const profile = resolveCaptureProfile({
        purpose: "singing",
        micMode: micModeRef.current,
        talkingNC: talkingNCRef.current,
        singingNC: singingNCRef.current,
      });
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: toMediaTrackConstraints(profile, captureDeviceId),
      });

      // Voice effect chain feeds a dedicated destination (low-latency send path)
      const ctx = new AudioContext({ sampleRate: 48000 });
      const dest = ctx.createMediaStreamDestination();

      const micSource = ctx.createMediaStreamSource(micStream);
      const micGain = ctx.createGain();
      micGain.gain.value = mixMicGainValueRef.current;

      const chain = createEffectChain(ctx, voiceEffectRef.current);
      micSource.connect(chain.input);
      chain.output.connect(micGain);
      micGain.connect(dest);
      chain.setWetDry?.(effectWetDryRef.current);

      mixCtxRef.current = ctx;
      mixDestRef.current = dest;
      mixMicSourceRef.current = micSource;
      mixMicGainRef.current = micGain;
      mixMicStreamRef.current = micStream; setMixMicStreamState(micStream);
      effectChainRef.current = chain;

      const voiceTrack = dest.stream.getAudioTracks()[0];
      if (!voiceTrack) throw new Error("No voice track");

      log.debug("Publishing singer voice track...");
      const pub = await room.localParticipant.publishTrack(voiceTrack, {
        source: Track.Source.Microphone,
        name: VOICE_TRACK_NAME,
        audioPreset: toAudioPreset(profile.preset),
        dtx: profile.dtx,
        red: false,
      });

      log.debug("Voice track published!", pub.trackSid);

      mixPubRef.current = pub;
      // A mute that landed while the pipeline was building only moved the flag
      if (!isMicEnabledRef.current) detachMicFromMix();
      setIsSinging(true);
      setSingingError(null);
    } catch (err) {
      cleanupMix();
      // Restore managed mic with current NC settings
      syncNCToRoom();
      try {
        if (isMicEnabledRef.current && roomRef.current) {
          beginAudioCapture("mic");
          await roomRef.current.localParticipant.setMicrophoneEnabled(true);
        }
      } catch { /* best effort */ }

      const { kind, message } = classifyMicError(err, START_SINGING_ERRORS);
      // A denial is the user's answer, not a fault worth a stack in the console
      if (kind !== "denied") log.error("Singing error:", err);
      setSingingError(message);
    } finally {
      isSingingInFlightRef.current = false;
    }
  }, [captureDeviceId, cleanupMix, syncNCToRoom, detachMicFromMix]);

  const stopSinging = useCallback(() => {
    const room = roomRef.current;

    log.debug("Stopping singing");

    if (mixPubRef.current?.track && room?.localParticipant) {
      void room.localParticipant.unpublishTrack(mixPubRef.current.track);
    }
    mixPubRef.current = null;

    cleanupMix();

    setIsSinging(false);
    setSingingError(null);

    // A mic check outlives the turn: leave the managed mic muted and hand the
    // restore to stopMicCheck, or the room hears the private check.
    if (micCheckAbortRef.current) {
      micCheckRestoreMicRef.current = isMicEnabledRef.current;
      return;
    }

    // Restore managed mic with current NC settings
    syncNCToRoom();
    if (room && isMicEnabledRef.current) {
      beginAudioCapture("mic");
      void room.localParticipant.setMicrophoneEnabled(true).catch((err) => {
        log.error("Error restoring managed mic:", err);
      });
    }
  }, [cleanupMix, syncNCToRoom]);

  // Leaving the room drops every owner. The release to "playback" is never written
  // here on mount: the label-permission probe in useAudioDevices is still opening a
  // capture at that point, and "playback" pins a category that cannot record.
  useEffect(() => resetAudioSession, []);

  // The singing pipeline follows the stage turn: start on promotion, stop on exit
  useEffect(() => {
    if (isMyTurn && !isSinging && !isSingingInFlightRef.current) {
      // A leftover loopback would be re-captured by the live mic and heard by the room.
      // Unconditional: a check still waiting on getUserMedia has no abort yet, and it
      // would arm itself mid-song. Skip the managed-mic restore too - startSinging owns
      // the mic state from here and a late async re-enable would race its disable.
      micCheckRestoreMicRef.current = false;
      stopMicCheck();
      void startSinging();
    }
    if (!isMyTurn && isSinging) {
      stopSinging();
    }
  }, [isMyTurn, isSinging, startSinging, stopSinging, stopMicCheck]);

  return { toggleMic, setMicMuted, restartMic, setMixMicGain, setVoiceEffect, setEffectWetDry, startSinging, stopSinging };
}
