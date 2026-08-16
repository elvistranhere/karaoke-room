"use client";

import { useCallback, useEffect, useRef } from "react";
import { AudioPresets, Track } from "livekit-client";

import { createEffectChain, type VoiceEffect } from "~/lib/voiceEffects";
import { writePref } from "~/lib/prefs";
import type { LiveKitCtx } from "./context";

// The singer publishes this alongside LiveKit's muted managed mic, so both carry
// Track.Source.Microphone and only the name tells them apart.
export const VOICE_TRACK_NAME = "karaoke-voice";

export const MIC_ON_PREF_KEY = "karaoke-mic-on";

// --- Hot-swap NC while singing ---
// When NC toggle changes while singing, re-capture mic with new constraints

export function useSingingNCHotSwap(
  lk: LiveKitCtx,
  singingNC: boolean,
  selectedInputDeviceId: string,
): void {
  const {
    prevSingingNCRef,
    mixCtxRef,
    mixMicSourceRef,
    mixMicStreamRef,
    mixPubRef,
    effectChainRef,
    setMixMicStreamState,
  } = lk;

  useEffect(() => {
    if (prevSingingNCRef.current === singingNC) return;
    prevSingingNCRef.current = singingNC;

    // Only hot-swap if the singing mix is live
    if (!mixPubRef.current || !mixMicStreamRef.current || !mixCtxRef.current) return;

    console.log("[LiveKit] Hot-swapping NC while singing:", singingNC ? "ON" : "OFF");
    const ctx = mixCtxRef.current;
    void (async () => {
      try {
        const nc = singingNC;
        const newStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: selectedInputDeviceId ? { exact: selectedInputDeviceId } : undefined,
            echoCancellation: nc,
            noiseSuppression: nc,
            autoGainControl: nc,
            channelCount: 2,
            sampleRate: 48000,
          },
        });

        // The turn can end while getUserMedia is pending; the fresh capture would
        // otherwise stay open with nothing left holding a reference to it.
        if (mixCtxRef.current !== ctx || !mixPubRef.current) {
          newStream.getTracks().forEach((t) => t.stop());
          return;
        }

        // Stop old mic stream
        mixMicStreamRef.current?.getTracks().forEach((t) => t.stop());
        mixMicStreamRef.current = newStream; setMixMicStreamState(newStream);

        // Reconnect in the Web Audio graph
        mixMicSourceRef.current?.disconnect();
        const chain = effectChainRef.current;
        if (ctx && chain) {
          const newSource = ctx.createMediaStreamSource(newStream);
          newSource.connect(chain.input);
          mixMicSourceRef.current = newSource;
          console.log("[LiveKit] Mix mic re-captured with NC:", nc ? "ON" : "OFF");
        }
      } catch (err) {
        console.error("[LiveKit] Error hot-swapping NC:", err);
      }
    })();
  }, [singingNC, selectedInputDeviceId]);
}

export interface CaptureApi {
  toggleMic: (target?: boolean) => Promise<void>;
  setMicMuted: (muted: boolean) => Promise<void>;
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
  selectedInputDeviceId: string,
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
    micErrorTimerRef,
    isMicEnabledRef,
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
    try {
      console.log("[LiveKit] Setting mic enabled:", newState);

      // If the mix owns the mic, add/remove it there instead of the LiveKit managed
      // mic. mixOwnsMicRef, not mixPubRef: startSinging claims the mic before its
      // awaits, so a toggle mid-promotion cannot re-arm the managed mic on top.
      if (mixOwnsMicRef.current) {
        if (!mixCtxRef.current || !mixDestRef.current || !mixPubRef.current) {
          // startSinging is still building the pipeline; it reconciles this state
          isMicEnabledRef.current = newState;
        } else if (newState && !mixMicStreamRef.current) {
          // Add mic to mix
          const nc = singingNCRef.current;
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: selectedInputDeviceId ? { exact: selectedInputDeviceId } : undefined,
              echoCancellation: nc,
              noiseSuppression: nc,
              autoGainControl: nc,
              channelCount: 2,
              sampleRate: 48000,
            },
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

          console.log("[LiveKit] Mic added to mix on the fly");
        } else if (!newState && mixMicStreamRef.current) {
          detachMicFromMix();
          console.log("[LiveKit] Mic removed from mix on the fly");
        }
        setIsMicEnabled(newState);
      } else {
        // Not singing - use LiveKit managed mic
        await room.localParticipant.setMicrophoneEnabled(newState);
        setIsMicEnabled(newState);
      }

      if (persist) writePref(MIC_ON_PREF_KEY, newState ? "on" : "off");
      console.log("[LiveKit] Mic is now", newState ? "ON" : "OFF");
    } catch (err) {
      console.error("[LiveKit] Mic error:", err);
      // A denied permission must not leave the button showing a live mic
      setIsMicEnabled(mixOwnsMicRef.current
        ? mixMicStreamRef.current !== null
        : room.localParticipant.isMicrophoneEnabled === true);
      const errName = err instanceof Error ? err.name : "";
      const isTransient = errName === "NotAllowedError" || errName === "NotFoundError";
      const msg = errName === "NotAllowedError"
        ? "Mic permission needed - click Unmute again"
        : errName === "NotFoundError"
          ? "No microphone found - check your device"
          : (err instanceof Error ? err.message : "Mic failed");
      setError(msg);
      // Clear previous timer, schedule new one - only one timer active at a time
      if (micErrorTimerRef.current) clearTimeout(micErrorTimerRef.current);
      if (isTransient) {
        micErrorTimerRef.current = setTimeout(() => {
          setError((prev) => prev === msg ? null : prev);
          micErrorTimerRef.current = null;
        }, 3000);
      }
    } finally {
      isTogglingMicRef.current = false;
      const pending = pendingMicStateRef.current;
      pendingMicStateRef.current = null;
      if (pending && pending.state !== newState) {
        void applyMicStateSelfRef.current?.(pending.state, pending.persist);
      }
    }
  }, [selectedInputDeviceId, detachMicFromMix]);
  applyMicStateSelfRef.current = applyMicState;

  // Explicit target, not a toggle: the caller passes the state its label promised,
  // so a click landing mid-flight cannot invert the user's intent off a stale ref.
  const toggleMic = useCallback(async (target?: boolean) => {
    await applyMicState(target ?? !isMicEnabledRef.current, true);
  }, [applyMicState]);

  // Force mute/unmute - used by deafen and the join gesture, and handles both the
  // singing and idle paths. Unlike toggleMic, it sets a specific state.
  const setMicMuted = useCallback(async (muted: boolean) => {
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

    console.log("[LiveKit] Voice effect switched to:", effect);
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
    try {
      // Taking the stage never overrides an explicit mute: the pipeline is built
      // either way, and the detach after publish keeps a muted singer silent.
      const singNC = singingNCRef.current;
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: selectedInputDeviceId ? { exact: selectedInputDeviceId } : undefined,
          echoCancellation: singNC,
          noiseSuppression: singNC,
          autoGainControl: singNC,
          channelCount: 2,
          sampleRate: 48000,
        },
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

      // Mute LiveKit's managed mic to avoid duplicate voice
      await room.localParticipant.setMicrophoneEnabled(false);

      const voiceTrack = dest.stream.getAudioTracks()[0];
      if (!voiceTrack) throw new Error("No voice track");

      console.log("[LiveKit] Publishing singer voice track...");
      const pub = await room.localParticipant.publishTrack(voiceTrack, {
        source: Track.Source.Microphone,
        name: VOICE_TRACK_NAME,
        audioPreset: AudioPresets.musicHighQuality,
        dtx: false,
        red: false,
      });

      console.log("[LiveKit] Voice track published!", pub.trackSid);

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
          await roomRef.current.localParticipant.setMicrophoneEnabled(true);
        }
      } catch { /* best effort */ }

      if (err instanceof Error && err.name === "NotAllowedError") {
        setSingingError("Microphone permission needed to sing");
      } else {
        const msg = err instanceof Error ? err.message : "Failed to start singing";
        console.error("[LiveKit] Singing error:", err);
        setSingingError(msg);
      }
    } finally {
      isSingingInFlightRef.current = false;
    }
  }, [selectedInputDeviceId, cleanupMix, syncNCToRoom, detachMicFromMix]);

  const stopSinging = useCallback(() => {
    const room = roomRef.current;

    console.log("[LiveKit] Stopping singing");

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
      void room.localParticipant.setMicrophoneEnabled(true).catch((err) => {
        console.error("[LiveKit] Error restoring managed mic:", err);
      });
    }
  }, [cleanupMix, syncNCToRoom]);

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

  return { toggleMic, setMicMuted, setMixMicGain, setVoiceEffect, setEffectWetDry, startSinging, stopSinging };
}
