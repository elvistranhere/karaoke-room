"use client";

import { useCallback, useEffect } from "react";
import { Track } from "livekit-client";

import { createEffectChain, type VoiceEffect } from "~/lib/voiceEffects";
import { beginAudioCapture, endAudioCapture } from "~/lib/audioSession";
import { resolveCaptureProfile, toMediaTrackConstraints } from "~/lib/audioProfile";
import {
  applyNoiseCancellationInPlace,
  capturesAreExclusive,
  isStreamLive,
  stopStream,
} from "~/lib/micCapture";
import type { LiveKitCtx, MicCheckState } from "./context";
import { createLogger } from "~/lib/logger";

const log = createLogger("LiveKit");

const MIC_CHECK_GUM_TIMEOUT_MS = 15000;
const CTX_RESUME_TIMEOUT_MS = 400;
const LOOPBACK_SAMPLE_RATE = 48000;

// Pinned like the mixer graph, so a 16 kHz Bluetooth route cannot decide what the
// loopback sounds like, with the same bare fallback for an engine that cannot open it.
function createLoopbackContext(): AudioContext {
  try {
    return new AudioContext({ sampleRate: LOOPBACK_SAMPLE_RATE });
  } catch {
    return new AudioContext();
  }
}

// WebKit parks resume() forever while the audio session is interrupted, so the
// context state decides the outcome rather than the promise.
async function resumeWithTimeout(ctx: AudioContext): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    ctx.resume().catch(() => {}),
    new Promise<void>((resolve) => { timer = setTimeout(resolve, CTX_RESUME_TIMEOUT_MS); }),
  ]);
  clearTimeout(timer);
}

// A hung permission prompt would otherwise leave the mic check unstartable forever
function getMicStreamWithTimeout(constraints: MediaStreamConstraints): Promise<MediaStream> {
  return new Promise<MediaStream>((resolve, reject) => {
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      reject(new Error("Microphone request timed out"));
    }, MIC_CHECK_GUM_TIMEOUT_MS);
    navigator.mediaDevices.getUserMedia(constraints).then(
      (stream) => {
        if (timedOut) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        clearTimeout(timer);
        resolve(stream);
      },
      (err) => {
        if (!timedOut) {
          clearTimeout(timer);
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      },
    );
  });
}

export interface MicCheckApi {
  startTalkingMicCheck: (noiseCancellation: boolean) => Promise<void>;
  startSingingMicCheck: (noiseCancellation: boolean) => Promise<void>;
  stopMicCheck: () => void;
}

// --- Real-time mic check (live loopback) ---
// Routes mic audio through Web Audio API directly to speakers so you hear
// yourself in real-time. Mutes all remote audio during monitoring to avoid
// confusion. Toggle on/off - no record-and-playback delay.

export function useMicCheck(
  lk: LiveKitCtx,
  micCheckState: MicCheckState,
  captureDeviceId: string,
  talkingNC: boolean,
  singingNC: boolean,
  voiceEffect: VoiceEffect,
  // The singing mix's capture, which a check taken during a turn borrows where two
  // captures cannot overlap. Every replacement and teardown of it lands in this value.
  mixMicStream: MediaStream | null,
  syncNCToRoom: () => void,
): MicCheckApi {
  const {
    mixer,
    roomRef,
    micCheckAbortRef,
    micCheckCtxRef,
    micCheckSourceRef,
    micCheckGainRef,
    micCheckStreamRef,
    micCheckEffectChainRef,
    micCheckErrorTimerRef,
    micCheckRestoreMicRef,
    micCheckPrevMixGainRef,
    micCheckGenRef,
    micCheckInFlightRef,
    micCheckSharedStreamRef,
    mixMicGainRef,
    mixMicStreamRef,
    mixOwnsMicRef,
    isMicEnabledRef,
    micModeRef,
    talkingNCRef,
    singingNCRef,
    selectedOutputRef,
    voiceEffectRef,
    effectWetDryRef,
    setMicCheckState,
  } = lk;

  // One duck gain on the mixer bus hushes every remote voice for the check
  const muteRemoteAudio = useCallback(() => {
    mixer.setDuck(0);
  }, [mixer]);

  const restoreRemoteAudio = useCallback(() => {
    mixer.setDuck(1);
  }, [mixer]);

  // Stop any active mic check monitoring
  const stopMicCheck = useCallback(() => {
    // Cancels a check still waiting on getUserMedia: it checks the generation
    // before it arms anything.
    micCheckGenRef.current++;
    micCheckInFlightRef.current = false;
    if (micCheckErrorTimerRef.current) {
      clearTimeout(micCheckErrorTimerRef.current);
      micCheckErrorTimerRef.current = null;
    }
    micCheckAbortRef.current?.();
    micCheckAbortRef.current = null;
    // A check cancelled before it armed never ran the abort that clears this
    micCheckSharedStreamRef.current = false;
    // After the abort: it stops the loopback capture this release answers for
    endAudioCapture("mic-check");
    restoreRemoteAudio();
    if (micCheckPrevMixGainRef.current !== null) {
      if (mixMicGainRef.current) mixMicGainRef.current.gain.value = micCheckPrevMixGainRef.current;
      micCheckPrevMixGainRef.current = null;
    }
    if (micCheckRestoreMicRef.current) {
      micCheckRestoreMicRef.current = false;
      const room = roomRef.current;
      // The singing mix carries the voice while it is live: re-enabling the managed
      // mic here would publish a second, raw copy of the singer.
      if (room && isMicEnabledRef.current && !mixOwnsMicRef.current) {
        syncNCToRoom();
        void room.localParticipant.setMicrophoneEnabled(true).catch(() => {});
      }
    }
    setMicCheckState("idle");
  }, [restoreRemoteAudio, syncNCToRoom]);

  // A private check must not reach the room: silence the published mix. Runs after the
  // loopback capture succeeds. While singing this zeroed gain is the whole isolation,
  // because the managed mic is already released.
  const isolateMicCheckFromRoom = useCallback(() => {
    if (mixMicGainRef.current) {
      micCheckPrevMixGainRef.current = mixMicGainRef.current.gain.value;
      mixMicGainRef.current.gain.value = 0;
    }
  }, []);

  // The managed mic is the other capture that can be open when a check starts, and the
  // check is about to silence it anyway, so it is released before the loopback opens
  // rather than after: on iOS two open captures cost the older one permanently.
  const releaseManagedMicForCheck = useCallback(async () => {
    const room = roomRef.current;
    if (!room || mixOwnsMicRef.current || !isMicEnabledRef.current || micCheckRestoreMicRef.current) return;
    micCheckRestoreMicRef.current = true;
    const managed = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.audioTrack;
    await room.localParticipant.setMicrophoneEnabled(false).catch(() => {});
    // LiveKit's mute leaves the track live; only an ended one is re-acquired on unmute
    managed?.mediaStreamTrack.stop();
  }, []);

  // Where two captures cannot overlap, the check never opens a second one while the
  // singing mix holds one: it monitors the mix's own stream, the same microphone the
  // room is already hearing. Everywhere else it keeps its own, because the borrowed one
  // carries the singing constraints rather than the ones the check asked for, and the
  // profile segments and the NC toggle would both be describing a capture they cannot
  // move: the shared-stream guard in each hot-swap effect bails on it.
  const acquireCheckStream = useCallback(async (
    constraints: MediaStreamConstraints,
  ): Promise<{ stream: MediaStream; shared: boolean }> => {
    const shared = mixOwnsMicRef.current && capturesAreExclusive() ? mixMicStreamRef.current : null;
    if (shared && isStreamLive(shared)) {
      micCheckSharedStreamRef.current = true;
      return { stream: shared, shared: true };
    }
    micCheckSharedStreamRef.current = false;
    await releaseManagedMicForCheck();
    return { stream: await getMicStreamWithTimeout(constraints), shared: false };
  }, [releaseManagedMicForCheck]);

  // The release above happens before the capture, so a check that never starts has to
  // put the managed mic back itself; the normal path hands that to stopMicCheck.
  const restoreManagedMicAfterFailure = useCallback(() => {
    if (!micCheckRestoreMicRef.current) return;
    micCheckRestoreMicRef.current = false;
    const room = roomRef.current;
    if (!room || !isMicEnabledRef.current || mixOwnsMicRef.current) return;
    syncNCToRoom();
    void room.localParticipant.setMicrophoneEnabled(true).catch(() => {});
  }, [syncNCToRoom]);

  const scheduleMicCheckErrorReset = useCallback(() => {
    if (micCheckErrorTimerRef.current) clearTimeout(micCheckErrorTimerRef.current);
    micCheckErrorTimerRef.current = setTimeout(() => {
      micCheckErrorTimerRef.current = null;
      setMicCheckState((prev) => (prev === "error" ? "idle" : prev));
    }, 2000);
  }, []);

  // Talking Mic Check: live loopback with talking NC constraints
  const startTalkingMicCheck = useCallback(async (noiseCancellation: boolean) => {
    // If already monitoring, stop it (toggle behavior)
    if (micCheckState === "monitoring-talk" || micCheckState === "monitoring-sing") {
      stopMicCheck();
      return;
    }
    if (micCheckState !== "idle" && micCheckState !== "error") return;
    if (micCheckInFlightRef.current) return;
    micCheckInFlightRef.current = true;
    const gen = ++micCheckGenRef.current;
    if (micCheckErrorTimerRef.current) {
      clearTimeout(micCheckErrorTimerRef.current);
      micCheckErrorTimerRef.current = null;
    }

    beginAudioCapture("mic-check");
    // Held outside the try so a throw between the capture opening and the ref assignment
    // below cannot leave a live mic with no handle left to stop it.
    let acquired: MediaStream | null = null;
    let acquiredShared = false;
    try {
      const profile = resolveCaptureProfile({
        purpose: "mic-check-talk",
        micMode: micModeRef.current,
        talkingNC: noiseCancellation,
        singingNC: singingNCRef.current,
      });
      const { stream, shared } = await acquireCheckStream({
        audio: toMediaTrackConstraints(profile, captureDeviceId),
      });
      acquired = stream;
      acquiredShared = shared;
      // Cancelled while the permission prompt was up: arming now would duck the
      // room and hold the mic with no UI left to stop it.
      if (gen !== micCheckGenRef.current) {
        if (!shared) stopStream(stream);
        return;
      }
      const track = stream.getAudioTracks()[0];
      if (!track) { micCheckInFlightRef.current = false; endAudioCapture("mic-check"); return; }

      // Route mic -> speakers via AudioContext
      const ctx = createLoopbackContext();
      const source = ctx.createMediaStreamSource(stream);
      const gain = ctx.createGain();
      gain.gain.value = 1.0;
      source.connect(gain);
      gain.connect(ctx.destination);
      if (ctx.state !== "running") await resumeWithTimeout(ctx);
      if (gen !== micCheckGenRef.current) {
        if (!shared) track.stop();
        void ctx.close();
        return;
      }
      if (ctx.state !== "running") {
        if (!shared) track.stop();
        void ctx.close();
        throw new Error("Audio output is blocked by the browser");
      }

      // Route to selected output device if supported (setSinkId is not in TS types yet)
      if (selectedOutputRef.current && "setSinkId" in ctx) {
        void (ctx as unknown as { setSinkId: (id: string) => Promise<void> }).setSinkId(selectedOutputRef.current).catch(() => {});
      }

      // Store refs for hot-swap effects
      micCheckCtxRef.current = ctx;
      micCheckSourceRef.current = source;
      micCheckGainRef.current = gain;
      micCheckStreamRef.current = stream;
      micCheckEffectChainRef.current = null; // talking has no effect chain

      muteRemoteAudio();
      isolateMicCheckFromRoom();
      setMicCheckState("monitoring-talk");
      log.debug("Talking mic check: live monitoring started");

      // Read the refs, not the captured locals: hot-swaps replace stream and source
      micCheckAbortRef.current = () => {
        micCheckSourceRef.current?.disconnect();
        micCheckGainRef.current?.disconnect();
        // A shared stream belongs to the singing mix and outlives the check
        if (!micCheckSharedStreamRef.current) stopStream(micCheckStreamRef.current);
        micCheckSharedStreamRef.current = false;
        if (ctx.state !== "closed") void ctx.close();
        micCheckCtxRef.current = null;
        micCheckSourceRef.current = null;
        micCheckGainRef.current = null;
        micCheckStreamRef.current = null;
        micCheckEffectChainRef.current = null;
      };
      micCheckInFlightRef.current = false;
    } catch (err) {
      log.error("Talking mic check error:", err);
      if (acquired && !acquiredShared && micCheckStreamRef.current !== acquired) stopStream(acquired);
      micCheckInFlightRef.current = false;
      micCheckSharedStreamRef.current = false;
      endAudioCapture("mic-check");
      restoreManagedMicAfterFailure();
      setMicCheckState("error");
      scheduleMicCheckErrorReset();
    }
  }, [micCheckState, captureDeviceId, muteRemoteAudio, isolateMicCheckFromRoom, acquireCheckStream, restoreManagedMicAfterFailure, scheduleMicCheckErrorReset, stopMicCheck]);

  // Singing Mic Check: live loopback through voice effect chain
  const startSingingMicCheck = useCallback(async (noiseCancellation: boolean) => {
    // If already monitoring, stop it (toggle behavior)
    if (micCheckState === "monitoring-talk" || micCheckState === "monitoring-sing") {
      stopMicCheck();
      return;
    }
    if (micCheckState !== "idle" && micCheckState !== "error") return;
    if (micCheckInFlightRef.current) return;
    micCheckInFlightRef.current = true;
    const gen = ++micCheckGenRef.current;
    if (micCheckErrorTimerRef.current) {
      clearTimeout(micCheckErrorTimerRef.current);
      micCheckErrorTimerRef.current = null;
    }

    beginAudioCapture("mic-check");
    // Held outside the try so a throw between the capture opening and the ref assignment
    // below cannot leave a live mic with no handle left to stop it.
    let acquired: MediaStream | null = null;
    let acquiredShared = false;
    try {
      const profile = resolveCaptureProfile({
        purpose: "mic-check-sing",
        micMode: micModeRef.current,
        talkingNC: talkingNCRef.current,
        singingNC: noiseCancellation,
      });
      const { stream, shared } = await acquireCheckStream({
        audio: toMediaTrackConstraints(profile, captureDeviceId),
      });
      acquired = stream;
      acquiredShared = shared;
      // Cancelled while the permission prompt was up: arming now would silence the
      // singing mix and duck the room with no UI left to stop it.
      if (gen !== micCheckGenRef.current) {
        if (!shared) stopStream(stream);
        return;
      }
      const rawTrack = stream.getAudioTracks()[0];
      if (!rawTrack) { micCheckInFlightRef.current = false; endAudioCapture("mic-check"); return; }

      // Route mic -> effect chain -> speakers
      const ctx = createLoopbackContext();
      const source = ctx.createMediaStreamSource(stream);
      const chain = createEffectChain(ctx, voiceEffectRef.current);
      const gain = ctx.createGain();
      gain.gain.value = 1.0;

      source.connect(chain.input);
      chain.output.connect(gain);
      gain.connect(ctx.destination);
      if (ctx.state !== "running") await resumeWithTimeout(ctx);
      if (gen !== micCheckGenRef.current) {
        if (!shared) rawTrack.stop();
        chain.cleanup();
        void ctx.close();
        return;
      }
      if (ctx.state !== "running") {
        if (!shared) rawTrack.stop();
        chain.cleanup();
        void ctx.close();
        throw new Error("Audio output is blocked by the browser");
      }

      // Apply current wet/dry
      chain.setWetDry?.(effectWetDryRef.current);

      // Route to selected output device if supported (setSinkId is not in TS types yet)
      if (selectedOutputRef.current && "setSinkId" in ctx) {
        void (ctx as unknown as { setSinkId: (id: string) => Promise<void> }).setSinkId(selectedOutputRef.current).catch(() => {});
      }

      // Store refs for hot-swap effects
      micCheckCtxRef.current = ctx;
      micCheckSourceRef.current = source;
      micCheckGainRef.current = gain;
      micCheckStreamRef.current = stream;
      micCheckEffectChainRef.current = chain;

      muteRemoteAudio();
      isolateMicCheckFromRoom();
      setMicCheckState("monitoring-sing");
      log.debug("Singing mic check: live monitoring with effect:", voiceEffectRef.current);

      // Read the refs, not the captured locals: hot-swaps replace stream, source, and chain
      micCheckAbortRef.current = () => {
        micCheckSourceRef.current?.disconnect();
        micCheckEffectChainRef.current?.cleanup();
        micCheckGainRef.current?.disconnect();
        // A shared stream belongs to the singing mix and outlives the check
        if (!micCheckSharedStreamRef.current) stopStream(micCheckStreamRef.current);
        micCheckSharedStreamRef.current = false;
        if (ctx.state !== "closed") void ctx.close();
        micCheckCtxRef.current = null;
        micCheckSourceRef.current = null;
        micCheckGainRef.current = null;
        micCheckStreamRef.current = null;
        micCheckEffectChainRef.current = null;
      };
      micCheckInFlightRef.current = false;
    } catch (err) {
      log.error("Singing mic check error:", err);
      if (acquired && !acquiredShared && micCheckStreamRef.current !== acquired) stopStream(acquired);
      micCheckInFlightRef.current = false;
      micCheckSharedStreamRef.current = false;
      endAudioCapture("mic-check");
      restoreManagedMicAfterFailure();
      setMicCheckState("error");
      scheduleMicCheckErrorReset();
    }
  }, [micCheckState, captureDeviceId, muteRemoteAudio, isolateMicCheckFromRoom, acquireCheckStream, restoreManagedMicAfterFailure, scheduleMicCheckErrorReset, stopMicCheck]);

  // --- Hot-swap NC during talking mic check ---
  // When talkingNC changes while monitoring-talk, re-capture mic with new constraints
  useEffect(() => {
    if (micCheckState !== "monitoring-talk") return;
    const ctx = micCheckCtxRef.current;
    const oldSource = micCheckSourceRef.current;
    const gain = micCheckGainRef.current;
    if (!ctx || !oldSource || !gain) return;

    log.debug("Hot-swapping talking NC during mic check:", talkingNC ? "ON" : "OFF");
    void (async () => {
      const nc = talkingNC;
      // The singing hot-swap owns the capture whenever the check is only borrowing it
      if (micCheckSharedStreamRef.current) return;
      // The free swap: the open capture takes the new constraints, no second one opens
      if (await applyNoiseCancellationInPlace(micCheckStreamRef.current, nc)) return;
      const releaseFirst = capturesAreExclusive();
      const oldStream = micCheckStreamRef.current;
      if (releaseFirst) stopStream(oldStream);
      try {
        const profile = resolveCaptureProfile({
          purpose: "mic-check-talk",
          micMode: micModeRef.current,
          talkingNC: nc,
          singingNC: singingNCRef.current,
        });
        const newStream = await navigator.mediaDevices.getUserMedia({
          audio: toMediaTrackConstraints(profile, captureDeviceId),
        });

        // The check can be stopped mid-capture: the old refs are already null, so
        // parking the new stream there would leave the mic open with no owner.
        if (micCheckCtxRef.current !== ctx) {
          stopStream(newStream);
          return;
        }

        if (!releaseFirst) stopStream(oldStream);
        micCheckStreamRef.current = newStream;

        // Reconnect in the Web Audio graph
        oldSource.disconnect();
        const newSource = ctx.createMediaStreamSource(newStream);
        newSource.connect(gain);
        micCheckSourceRef.current = newSource;

        log.debug("Talking mic check re-captured with NC:", nc ? "ON" : "OFF");
      } catch (err) {
        log.error("Error hot-swapping talking NC:", err);
        // Nothing is left to monitor once the old capture was released, and a dead
        // loopback would keep the room ducked and the mic held.
        if (releaseFirst) stopMicCheck();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [talkingNC]);

  // --- Hot-swap NC during singing mic check ---
  // When singingNC changes while monitoring-sing, re-capture mic with new constraints
  useEffect(() => {
    if (micCheckState !== "monitoring-sing") return;
    const ctx = micCheckCtxRef.current;
    const oldSource = micCheckSourceRef.current;
    const chain = micCheckEffectChainRef.current;
    if (!ctx || !oldSource || !chain) return;

    log.debug("Hot-swapping singing NC during mic check:", singingNC ? "ON" : "OFF");
    void (async () => {
      const nc = singingNC;
      // The singing hot-swap owns the capture whenever the check is only borrowing it
      if (micCheckSharedStreamRef.current) return;
      // The free swap: the open capture takes the new constraints, no second one opens
      if (await applyNoiseCancellationInPlace(micCheckStreamRef.current, nc)) return;
      const releaseFirst = capturesAreExclusive();
      const oldStream = micCheckStreamRef.current;
      if (releaseFirst) stopStream(oldStream);
      try {
        const profile = resolveCaptureProfile({
          purpose: "mic-check-sing",
          micMode: micModeRef.current,
          talkingNC: talkingNCRef.current,
          singingNC: nc,
        });
        const newStream = await navigator.mediaDevices.getUserMedia({
          audio: toMediaTrackConstraints(profile, captureDeviceId),
        });

        // The check can be stopped mid-capture: the old refs are already null, so
        // parking the new stream there would leave the mic open with no owner.
        if (micCheckCtxRef.current !== ctx) {
          stopStream(newStream);
          return;
        }

        if (!releaseFirst) stopStream(oldStream);
        micCheckStreamRef.current = newStream;

        // Reconnect in the Web Audio graph
        oldSource.disconnect();
        const newSource = ctx.createMediaStreamSource(newStream);
        newSource.connect(chain.input);
        micCheckSourceRef.current = newSource;

        log.debug("Singing mic check re-captured with NC:", nc ? "ON" : "OFF");
      } catch (err) {
        log.error("Error hot-swapping singing NC:", err);
        // Nothing is left to monitor once the old capture was released, and a dead
        // loopback would keep the room ducked and the mic held.
        if (releaseFirst) stopMicCheck();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [singingNC]);

  // --- Hot-swap voice effect during singing mic check ---
  // When voiceEffect changes while monitoring-sing, swap effect chain live
  useEffect(() => {
    if (micCheckState !== "monitoring-sing") return;
    const ctx = micCheckCtxRef.current;
    const source = micCheckSourceRef.current;
    const gain = micCheckGainRef.current;
    const oldChain = micCheckEffectChainRef.current;
    if (!ctx || !source || !gain || !oldChain) return;

    // Tear down old chain and reconnect with new effect
    oldChain.cleanup();
    source.disconnect();

    const newChain = createEffectChain(ctx, voiceEffect);
    source.connect(newChain.input);
    newChain.output.connect(gain);
    newChain.setWetDry?.(effectWetDryRef.current);
    micCheckEffectChainRef.current = newChain;

    log.debug("Singing mic check effect swapped to:", voiceEffect);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceEffect]);

  // --- Follow the capture a shared check is borrowing ---
  // The mix replaces its stream on an NC or device swap and drops it when the turn or
  // the singer's own mute ends it. A stopped track raises no event, so a check left
  // pointed at the old one would monitor silence with no way to tell.
  useEffect(() => {
    if (!micCheckSharedStreamRef.current) return;
    if (!mixMicStream || !isStreamLive(mixMicStream)) {
      stopMicCheck();
      return;
    }
    const ctx = micCheckCtxRef.current;
    if (!ctx) return; // still arming, and it sources the current stream itself
    micCheckSourceRef.current?.disconnect();
    micCheckStreamRef.current = mixMicStream;
    const source = ctx.createMediaStreamSource(mixMicStream);
    const chain = micCheckEffectChainRef.current;
    if (chain) source.connect(chain.input);
    else if (micCheckGainRef.current) source.connect(micCheckGainRef.current);
    micCheckSourceRef.current = source;
  }, [mixMicStream, stopMicCheck]);

  // Backgrounding the tab interrupts the mic check AudioContext and it cannot be
  // resumed off a gesture on iOS, so stop the check instead of leaving the room
  // ducked, the music at 0 and the mic held by dead monitoring.
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState !== "hidden") return;
      if (!micCheckAbortRef.current && !micCheckInFlightRef.current) return;
      stopMicCheck();
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, [stopMicCheck]);

  return { startTalkingMicCheck, startSingingMicCheck, stopMicCheck };
}
