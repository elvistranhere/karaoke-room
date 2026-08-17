"use client";

import { useCallback, useEffect } from "react";

import { createEffectChain, type VoiceEffect } from "~/lib/voiceEffects";
import { beginAudioCapture, endAudioCapture } from "~/lib/audioSession";
import type { LiveKitCtx, MicCheckState } from "./context";

const MIC_CHECK_GUM_TIMEOUT_MS = 15000;
const CTX_RESUME_TIMEOUT_MS = 400;

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
    mixMicGainRef,
    mixOwnsMicRef,
    isMicEnabledRef,
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

  // A private check must not reach the room: silence the published paths and
  // remember what to restore. Runs after the loopback capture succeeds.
  const isolateMicCheckFromRoom = useCallback(() => {
    if (mixMicGainRef.current) {
      micCheckPrevMixGainRef.current = mixMicGainRef.current.gain.value;
      mixMicGainRef.current.gain.value = 0;
    }
    // While singing, the zeroed mix gain is the isolation: the managed mic is
    // already muted and must stay that way.
    if (mixOwnsMicRef.current) return;
    const room = roomRef.current;
    if (room && isMicEnabledRef.current && !micCheckRestoreMicRef.current) {
      micCheckRestoreMicRef.current = true;
      void room.localParticipant.setMicrophoneEnabled(false).catch(() => {});
    }
  }, []);

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
    try {
      const stream = await getMicStreamWithTimeout({
        audio: {
          deviceId: captureDeviceId ? { exact: captureDeviceId } : undefined,
          echoCancellation: noiseCancellation,
          noiseSuppression: noiseCancellation,
          autoGainControl: noiseCancellation,
          channelCount: 1,
        },
      });
      // Cancelled while the permission prompt was up: arming now would duck the
      // room and hold the mic with no UI left to stop it.
      if (gen !== micCheckGenRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const track = stream.getAudioTracks()[0];
      if (!track) { micCheckInFlightRef.current = false; endAudioCapture("mic-check"); return; }

      // Route mic -> speakers via AudioContext
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const gain = ctx.createGain();
      gain.gain.value = 1.0;
      source.connect(gain);
      gain.connect(ctx.destination);
      if (ctx.state !== "running") await resumeWithTimeout(ctx);
      if (gen !== micCheckGenRef.current) {
        track.stop();
        void ctx.close();
        return;
      }
      if (ctx.state !== "running") {
        track.stop();
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
      console.log("[LiveKit] Talking mic check: live monitoring started");

      // Read the refs, not the captured locals: hot-swaps replace stream and source
      micCheckAbortRef.current = () => {
        micCheckSourceRef.current?.disconnect();
        micCheckGainRef.current?.disconnect();
        micCheckStreamRef.current?.getTracks().forEach((t) => t.stop());
        if (ctx.state !== "closed") void ctx.close();
        micCheckCtxRef.current = null;
        micCheckSourceRef.current = null;
        micCheckGainRef.current = null;
        micCheckStreamRef.current = null;
        micCheckEffectChainRef.current = null;
      };
      micCheckInFlightRef.current = false;
    } catch (err) {
      console.error("[LiveKit] Talking mic check error:", err);
      micCheckInFlightRef.current = false;
      endAudioCapture("mic-check");
      setMicCheckState("error");
      scheduleMicCheckErrorReset();
    }
  }, [micCheckState, captureDeviceId, muteRemoteAudio, isolateMicCheckFromRoom, scheduleMicCheckErrorReset, stopMicCheck]);

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
    try {
      const stream = await getMicStreamWithTimeout({
        audio: {
          deviceId: captureDeviceId ? { exact: captureDeviceId } : undefined,
          echoCancellation: noiseCancellation,
          noiseSuppression: noiseCancellation,
          autoGainControl: noiseCancellation,
          channelCount: 2,
          sampleRate: 48000,
        },
      });
      // Cancelled while the permission prompt was up: arming now would silence the
      // singing mix and duck the room with no UI left to stop it.
      if (gen !== micCheckGenRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const rawTrack = stream.getAudioTracks()[0];
      if (!rawTrack) { micCheckInFlightRef.current = false; endAudioCapture("mic-check"); return; }

      // Route mic -> effect chain -> speakers
      const ctx = new AudioContext({ sampleRate: 48000 });
      const source = ctx.createMediaStreamSource(stream);
      const chain = createEffectChain(ctx, voiceEffectRef.current);
      const gain = ctx.createGain();
      gain.gain.value = 1.0;

      source.connect(chain.input);
      chain.output.connect(gain);
      gain.connect(ctx.destination);
      if (ctx.state !== "running") await resumeWithTimeout(ctx);
      if (gen !== micCheckGenRef.current) {
        rawTrack.stop();
        chain.cleanup();
        void ctx.close();
        return;
      }
      if (ctx.state !== "running") {
        rawTrack.stop();
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
      console.log("[LiveKit] Singing mic check: live monitoring with effect:", voiceEffectRef.current);

      // Read the refs, not the captured locals: hot-swaps replace stream, source, and chain
      micCheckAbortRef.current = () => {
        micCheckSourceRef.current?.disconnect();
        micCheckEffectChainRef.current?.cleanup();
        micCheckGainRef.current?.disconnect();
        micCheckStreamRef.current?.getTracks().forEach((t) => t.stop());
        if (ctx.state !== "closed") void ctx.close();
        micCheckCtxRef.current = null;
        micCheckSourceRef.current = null;
        micCheckGainRef.current = null;
        micCheckStreamRef.current = null;
        micCheckEffectChainRef.current = null;
      };
      micCheckInFlightRef.current = false;
    } catch (err) {
      console.error("[LiveKit] Singing mic check error:", err);
      micCheckInFlightRef.current = false;
      endAudioCapture("mic-check");
      setMicCheckState("error");
      scheduleMicCheckErrorReset();
    }
  }, [micCheckState, captureDeviceId, muteRemoteAudio, isolateMicCheckFromRoom, scheduleMicCheckErrorReset, stopMicCheck]);

  // --- Hot-swap NC during talking mic check ---
  // When talkingNC changes while monitoring-talk, re-capture mic with new constraints
  useEffect(() => {
    if (micCheckState !== "monitoring-talk") return;
    const ctx = micCheckCtxRef.current;
    const oldSource = micCheckSourceRef.current;
    const gain = micCheckGainRef.current;
    if (!ctx || !oldSource || !gain) return;

    console.log("[LiveKit] Hot-swapping talking NC during mic check:", talkingNC ? "ON" : "OFF");
    void (async () => {
      try {
        const nc = talkingNC;
        const newStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: captureDeviceId ? { exact: captureDeviceId } : undefined,
            echoCancellation: nc,
            noiseSuppression: nc,
            autoGainControl: nc,
            channelCount: 1,
          },
        });

        // The check can be stopped mid-capture: the old refs are already null, so
        // parking the new stream there would leave the mic open with no owner.
        if (micCheckCtxRef.current !== ctx) {
          newStream.getTracks().forEach((t) => t.stop());
          return;
        }

        // Stop old mic stream
        micCheckStreamRef.current?.getTracks().forEach((t) => t.stop());
        micCheckStreamRef.current = newStream;

        // Reconnect in the Web Audio graph
        oldSource.disconnect();
        const newSource = ctx.createMediaStreamSource(newStream);
        newSource.connect(gain);
        micCheckSourceRef.current = newSource;

        console.log("[LiveKit] Talking mic check re-captured with NC:", nc ? "ON" : "OFF");
      } catch (err) {
        console.error("[LiveKit] Error hot-swapping talking NC:", err);
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

    console.log("[LiveKit] Hot-swapping singing NC during mic check:", singingNC ? "ON" : "OFF");
    void (async () => {
      try {
        const nc = singingNC;
        const newStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: captureDeviceId ? { exact: captureDeviceId } : undefined,
            echoCancellation: nc,
            noiseSuppression: nc,
            autoGainControl: nc,
            channelCount: 2,
            sampleRate: 48000,
          },
        });

        // The check can be stopped mid-capture: the old refs are already null, so
        // parking the new stream there would leave the mic open with no owner.
        if (micCheckCtxRef.current !== ctx) {
          newStream.getTracks().forEach((t) => t.stop());
          return;
        }

        // Stop old mic stream
        micCheckStreamRef.current?.getTracks().forEach((t) => t.stop());
        micCheckStreamRef.current = newStream;

        // Reconnect in the Web Audio graph
        oldSource.disconnect();
        const newSource = ctx.createMediaStreamSource(newStream);
        newSource.connect(chain.input);
        micCheckSourceRef.current = newSource;

        console.log("[LiveKit] Singing mic check re-captured with NC:", nc ? "ON" : "OFF");
      } catch (err) {
        console.error("[LiveKit] Error hot-swapping singing NC:", err);
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

    console.log("[LiveKit] Singing mic check effect swapped to:", voiceEffect);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceEffect]);

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
