"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteParticipant,
  ConnectionState,
  AudioPresets,
  DisconnectReason,
} from "livekit-client";

import type { MicMode } from "../useAudioDevices";
import type { VoiceMixer } from "~/lib/voiceMixer";
import { capturesAreExclusive, stopStream } from "~/lib/micCapture";
import { resumeSilentUnlock } from "~/lib/silentUnlock";
import { dropMixCapture, MIC_STOPPED_MESSAGE } from "./capture";
import type { LiveKitCtx } from "./context";

const playPausedRemoteElements = () => {
  document.querySelectorAll<HTMLAudioElement>('audio[id^="lk-audio-"]').forEach((el) => {
    if (el.paused) el.play().catch(() => {});
  });
};

// The single recovery path for audio the browser or the OS killed, always run from a
// real user gesture. One in-flight run at a time: two concurrent startAudio() calls
// each emit AudioPlaybackStatusChanged, and the loser lands last with a stale answer.
let resumeInFlight: { room: Room | null; promise: Promise<void> } | null = null;

export function resumeRoomAudio(room: Room | null, mixer: VoiceMixer): Promise<void> {
  if (resumeInFlight && resumeInFlight.room === room) return resumeInFlight.promise;
  const run = async (): Promise<void> => {
    // A gesture only survives the synchronous head of this task, so everything that needs
    // the user activation runs there: mixer.resume() spends it on ctx.resume() before it
    // returns, and its rebuild tail is awaited afterwards, for the element sweep only.
    const settled = mixer.resume();
    playPausedRemoteElements();
    // The silent unlock element carries the ringer-switch fix on pre-16.4 WebKit and is
    // outside the lk-audio sweep on purpose, so it needs the gesture named directly.
    resumeSilentUnlock();
    // startAudio unmutes every attached element, so it only runs when LiveKit itself
    // reports blocked playback. Calling it under a live graph plays each remote voice
    // twice, element and graph, until syncElements lands.
    if (room && !room.canPlaybackAudio) {
      try {
        await room.startAudio();
        playPausedRemoteElements();
      } catch (err) {
        console.warn("[LiveKit] startAudio failed from the audio recovery control:", err);
      }
    }
    await settled;
    mixer.syncElements();
  };
  const entry: { room: Room | null; promise: Promise<void> } = {
    room,
    promise: run().finally(() => { if (resumeInFlight === entry) resumeInFlight = null; }),
  };
  resumeInFlight = entry;
  return entry.promise;
}

// Sync Room's audioCaptureDefaults to current NC before restoring managed mic
export function useSyncNCToRoom(lk: LiveKitCtx): () => void {
  const { roomRef, micModeRef, singingNCRef, talkingNCRef } = lk;
  return useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    const isRaw = micModeRef.current === "raw";
    const nc = isRaw ? singingNCRef.current : talkingNCRef.current;
    room.options.audioCaptureDefaults = {
      ...room.options.audioCaptureDefaults,
      echoCancellation: nc,
      noiseSuppression: nc,
      autoGainControl: nc,
    };
  }, []);
}

// --- Connect to LiveKit room ---

export function useRoomConnection(
  lk: LiveKitCtx,
  roomCode: string,
  captureDeviceId: string,
  selectedOutputDeviceId: string,
): void {
  const {
    mixer,
    roomRef,
    tokenRefreshRef,
    remoteAudioElsRef,
    micCheckAbortRef,
    micCheckGenRef,
    micCheckInFlightRef,
    micCheckRestoreMicRef,
    micErrorTimerRef,
    micModeRef,
    playerNameRef,
    audioUnlockedRef,
    selectedOutputRef,
    singingNCRef,
    talkingNCRef,
    mixCtxRef,
    mixDestRef,
    mixMicGainRef,
    mixMicSourceRef,
    mixMicStreamRef,
    mixOwnsMicRef,
    mixPubRef,
    setActiveSpeakers,
    setCanPlaybackAudio,
    setError,
    setIsConnected,
    setIsMicEnabled,
    setIsSinging,
    setMixMicStreamState,
  } = lk;

  useEffect(() => {
    if (!roomCode || !playerNameRef.current) return;

    let cancelled = false;

    const isRawMode = micModeRef.current === "raw";
    // NC setting depends on the current mode
    const ncEnabled = isRawMode ? singingNCRef.current : talkingNCRef.current;
    const room = new Room({
      audioCaptureDefaults: {
        echoCancellation: ncEnabled,
        noiseSuppression: ncEnabled,
        autoGainControl: ncEnabled,
        deviceId: captureDeviceId || undefined,
        channelCount: isRawMode ? 2 : 1,
        sampleRate: isRawMode ? 48000 : undefined,
      },
      audioOutput: {
        deviceId: selectedOutputDeviceId || undefined,
      },
      adaptiveStream: true,
      dynacast: true,
      publishDefaults: {
        audioPreset: isRawMode
          ? AudioPresets.musicHighQualityStereo
          : AudioPresets.music,
        dtx: !isRawMode, // DTX saves bandwidth for voice, disable for music
        red: true, // redundant encoding for packet loss resilience
      },
    });

    roomRef.current = room;

    // Remote audio: auto-attach
    room.on(
      RoomEvent.TrackSubscribed,
      (
        track: RemoteTrack,
        pub: RemoteTrackPublication,
        participant: RemoteParticipant,
      ) => {
        if (track.kind !== Track.Kind.Audio) return;
        console.log("[LiveKit] Subscribed to audio from", participant.identity, "source:", track.source);
        const el = track.attach();
        el.id = `lk-audio-${participant.identity}-${track.sid}`;
        el.dataset.lkIdentity = participant.identity;
        el.style.display = "none";
        el.autoplay = true;
        el.preload = "none";
        // Route to the selected output device
        if (selectedOutputRef.current && typeof el.setSinkId === "function") {
          void el.setSinkId(selectedOutputRef.current).catch(() => {});
        }
        const stale = remoteAudioElsRef.current.get(pub.trackSid);
        if (stale && stale !== el) stale.remove();
        remoteAudioElsRef.current.set(pub.trackSid, el);
        document.body.appendChild(el);
        // Force play - may fail due to autoplay policy, but startAudio handles that
        el.play().catch(() => {
          console.log("[LiveKit] Autoplay blocked for", participant.identity, "- will resume on user click");
        });
        // The element stays attached and playing: browsers only feed a remote WebRTC
        // track into Web Audio while it also has a live media sink, and the mixer
        // owns its volume (0 while the graph is audible, the local mix otherwise).
        mixer.attach(participant.identity, track.mediaStreamTrack, pub.trackSid, el);
      },
    );

    room.on(
      RoomEvent.TrackUnsubscribed,
      (
        track: RemoteTrack,
        pub: RemoteTrackPublication,
        participant: RemoteParticipant,
      ) => {
        if (track.kind !== Track.Kind.Audio) return;
        console.log("[LiveKit] Unsubscribed audio from", participant.identity);
        mixer.detach(pub.trackSid);
        const owned = remoteAudioElsRef.current.get(pub.trackSid);
        if (owned) {
          track.detach(owned);
          owned.remove();
          remoteAudioElsRef.current.delete(pub.trackSid);
        }
      },
    );

    // Blocked remote voices are only recoverable from a gesture, so the room gets a
    // control rather than a silent retry. Readings before the join gesture are the
    // autoplay policy answering a blind startAudio(), never a state the user is in.
    room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
      if (cancelled) return;
      // The elements are what feeds the mixer graph, and one created while the tab was
      // backgrounded had its play() refused with no gesture anywhere near it. Playback
      // going allowed is the signal that the refusal is over, and it arrives without a
      // DOM event, so the sweep hangs off it rather than off click and touchstart alone.
      if (room.canPlaybackAudio) {
        playPausedRemoteElements();
        mixer.syncElements();
      }
      if (!audioUnlockedRef.current) return;
      setCanPlaybackAudio(room.canPlaybackAudio);
    });

    // Active speakers - highlight who is talking
    room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      if (cancelled) return;
      // Include local participant if they're speaking
      const identities = new Set(speakers.map((p) => p.identity));
      if (room.localParticipant.isSpeaking) {
        identities.add(room.localParticipant.identity);
      }
      setActiveSpeakers(identities);
    });

    // Connection state - including reconnect awareness
    room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
      console.log("[LiveKit] Connection state:", state);
      if (cancelled) return;
      setIsConnected(state === ConnectionState.Connected);
    });

    room.on(RoomEvent.Reconnecting, () => {
      console.log("[LiveKit] Reconnecting...");
      if (!cancelled) setError("Reconnecting...");
    });

    room.on(RoomEvent.Reconnected, () => {
      console.log("[LiveKit] Reconnected!");
      if (!cancelled) {
        setIsConnected(true);
        setError(null);
      }
    });

    room.on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
      console.log("[LiveKit] Disconnected, reason:", reason);
      if (!cancelled) {
        setIsConnected(false);
        // Don't show error for client-initiated disconnects (page refresh, navigation)
        if (reason !== DisconnectReason.CLIENT_INITIATED) {
          setError("Disconnected - the room may have hit its session limit. Ask others to create a new room, or create one yourself.");
        }
      }
    });

    // Connect (with retry on transient errors + key failover)
    const connect = async (attempt = 0, useNextKey = false) => {
      try {
        const keyHint = useNextKey ? "&keyHint=next" : "";
        const res = await fetch(
          `/api/livekit-token?room=${encodeURIComponent(roomCode)}&name=${encodeURIComponent(playerNameRef.current)}${keyHint}`,
        );
        if (!res.ok) {
          const body = await res.json().catch(() => null) as { error?: string; reason?: string } | null;
          if (res.status === 429) {
            const err = new Error(body?.error ?? "This room has hit its session limit. Ask people in the room to create a new one, or create your own.");
            (err as Error & { reason?: string }).reason = body?.reason;
            throw err;
          }
          throw new Error(body?.error ?? "Failed to get token. Please try again.");
        }
        const data = (await res.json()) as { token: string; url?: string; keySet?: number };
        if (cancelled) return;

        // Server may return a different URL per key set (different LiveKit projects)
        const url = (data.url?.startsWith("wss://")) ? data.url : process.env.NEXT_PUBLIC_LIVEKIT_URL;
        if (!url) throw new Error("NEXT_PUBLIC_LIVEKIT_URL not set");

        console.log("[LiveKit] Connecting to", url, data.keySet ? `(key set #${data.keySet})` : "");
        await room.connect(url, data.token);
        if (cancelled) return;

        console.log("[LiveKit] Connected! Local participant:", room.localParticipant.identity);
        setIsConnected(true);
        setError(null);

        // Token refresh: re-fetch token every 30min to keep the LiveKit session alive
        // past the 1hr token TTL, and refresh the Redis room mapping TTL (prevents
        // ghost mapping expiry for long-running rooms with no new joins).
        if (tokenRefreshRef.current) clearInterval(tokenRefreshRef.current);
        tokenRefreshRef.current = setInterval(async () => {
          try {
            const refreshRes = await fetch(
              `/api/livekit-token?room=${encodeURIComponent(roomCode)}&name=${encodeURIComponent(playerNameRef.current)}`,
            );
            if (!refreshRes.ok) return;
            // Token refreshed on server side (Redis TTL extended). No need to reconnect.
          } catch {
            // Silent - next interval will retry
          }
        }, 30 * 60 * 1000); // 30 minutes

        // Resume audio context so remote audio plays without needing mic toggle.
        // Browsers block autoplay - also retried via manual click/keydown listeners below.
        // startAudio unmutes every attached element, so the mixer has to re-assert
        // its element state afterwards or each remote voice plays twice.
        room.startAudio().catch((e) => {
          console.warn("[LiveKit] startAudio failed (will retry on user click):", e);
        }).finally(() => mixer.syncElements());
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Connection failed";
        const reason = (err as Error & { reason?: string }).reason;
        console.error("[LiveKit] Error:", err);
        setError(msg);

        // all-exhausted = every key is quota-hit, no point retrying
        if (reason === "all-exhausted") return;

        // room-exhausted = server deleted stale mapping and will reassign on next request.
        // Retry once (no keyHint needed - server picks a fresh healthy key).
        if (reason === "room-exhausted") {
          if (attempt < 1) {
            console.log("[LiveKit] Room reassigned to healthy key, retrying...");
            setTimeout(() => { if (!cancelled) void connect(attempt + 1, false); }, 1000);
          }
          return;
        }

        // On connect failure, retry with a different key set first, then exponential backoff
        if (attempt < 3) {
          const tryNextKey = attempt === 0; // first retry uses next key set
          const delay = Math.min(1000 * 2 ** attempt, 8000);
          console.log(`[LiveKit] Retrying in ${delay}ms (attempt ${attempt + 1}/3)${tryNextKey ? " with next key" : ""}...`);
          setTimeout(() => { if (!cancelled) void connect(attempt + 1, tryNextKey); }, delay);
        }
      }
    };

    void connect();

    // Resume audio on user interaction (autoplay policy workaround). Same single path
    // as the recovery control, so a tap on the control never runs the recovery twice.
    // A gesture is the one moment startAudio's answer is the user's own state, so it
    // is also where the blocked-playback flag is read.
    const resumeAudio = () => {
      void resumeRoomAudio(room, mixer).then(() => {
        if (!cancelled) setCanPlaybackAudio(room.canPlaybackAudio);
      });
    };
    // Returning to the tab after an interruption (call, backgrounding) is the other
    // moment a suspended context can come back without waiting for a tap. It carries
    // no user activation, so it retries without ever writing a verdict to the UI.
    const resumeOnVisible = () => {
      if (document.visibilityState === "visible") void resumeRoomAudio(room, mixer);
    };
    document.addEventListener("click", resumeAudio, { once: false });
    document.addEventListener("keydown", resumeAudio, { once: false });
    document.addEventListener("touchstart", resumeAudio, { once: false });
    document.addEventListener("visibilitychange", resumeOnVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("click", resumeAudio);
      document.removeEventListener("keydown", resumeAudio);
      document.removeEventListener("touchstart", resumeAudio);
      document.removeEventListener("visibilitychange", resumeOnVisible);
      // Abort any in-progress mic check and restore remote audio. Bumping the
      // generation also cancels a check still waiting on getUserMedia.
      micCheckGenRef.current++;
      micCheckInFlightRef.current = false;
      micCheckAbortRef.current?.();
      micCheckAbortRef.current = null;
      micCheckRestoreMicRef.current = false;
      if (micErrorTimerRef.current) { clearTimeout(micErrorTimerRef.current); micErrorTimerRef.current = null; }
      mixer.destroy();
      // Clean up mix context if active
      if (mixPubRef.current?.track) {
        void room.localParticipant?.unpublishTrack(mixPubRef.current.track);
      }
      mixPubRef.current = null;
      mixOwnsMicRef.current = false;
      mixMicSourceRef.current?.disconnect();
      mixMicStreamRef.current?.getTracks().forEach((t) => t.stop());
      mixMicStreamRef.current = null; setMixMicStreamState(null);
      if (mixCtxRef.current?.state !== "closed") {
        void mixCtxRef.current?.close();
      }
      mixCtxRef.current = null;
      mixMicSourceRef.current = null;
      mixMicGainRef.current = null;
      mixDestRef.current = null;
      // Stop token refresh timer
      if (tokenRefreshRef.current) { clearInterval(tokenRefreshRef.current); tokenRefreshRef.current = null; }
      // Remove all remote audio elements to prevent duplicates on reconnect
      document.querySelectorAll('audio[id^="lk-audio-"]').forEach((el) => el.remove());
      remoteAudioElsRef.current.clear();
      room.disconnect();
      roomRef.current = null;
      setIsConnected(false);
      setCanPlaybackAudio(true);
      setIsMicEnabled(false);
      setIsSinging(false);
    };
    // playerName uses a ref - name changes only go through PartyKit, not LiveKit.
    // micMode is NOT included - handled by a separate effect that republishes the mic track.
    // captureDeviceId/selectedOutputDeviceId are NOT included - handled by separate effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode]);
}

// --- Switch input device without reconnecting ---

export function useInputDeviceSwitch(
  lk: LiveKitCtx,
  captureDeviceId: string,
  isConnected: boolean,
): void {
  const {
    roomRef,
    singingNCRef,
    mixCtxRef,
    mixMicGainRef,
    mixMicSourceRef,
    mixMicStreamRef,
    mixPubRef,
    effectChainRef,
    setMicStopped,
    setMixMicStreamState,
    setSingingError,
  } = lk;

  // isConnected flips on every LiveKit reconnect, and re-running the branch below
  // would re-capture a live singing mix mid-song for a device that never changed.
  const appliedDeviceIdRef = useRef<string | null>(null);

  useEffect(() => {
    const room = roomRef.current;
    if (!room || !isConnected || !captureDeviceId) return;
    if (appliedDeviceIdRef.current === captureDeviceId) return;
    appliedDeviceIdRef.current = captureDeviceId;

    console.log("[LiveKit] Switching mic input to device:", captureDeviceId);

    // If mix is active, re-capture the mic from the new device
    if (mixPubRef.current && mixMicStreamRef.current) {
      const ctx = mixCtxRef.current;
      void (async () => {
        // A device change is the one swap with no in-graph form: the constraint that
        // moves is the device itself. iOS holds a single capture unit, so the old one
        // is released before the new device opens rather than alongside it.
        const releaseFirst = capturesAreExclusive();
        const oldStream = mixMicStreamRef.current;
        if (releaseFirst) stopStream(oldStream);
        try {
          const nc = singingNCRef.current;
          const newStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: { exact: captureDeviceId },
              echoCancellation: nc,
              noiseSuppression: nc,
              autoGainControl: nc,
              channelCount: 2,
              sampleRate: 48000,
            },
          });

          // The mix can be torn down while getUserMedia is pending: without this the
          // fresh capture is parked in a ref nobody stops and the mic stays open.
          if (mixCtxRef.current !== ctx || !mixPubRef.current) {
            stopStream(newStream);
            return;
          }

          if (!releaseFirst) stopStream(oldStream);
          mixMicStreamRef.current = newStream; setMixMicStreamState(newStream);

          mixMicSourceRef.current?.disconnect();
          const chain = effectChainRef.current;
          const gain = mixMicGainRef.current;
          if (ctx) {
            const newSource = ctx.createMediaStreamSource(newStream);
            // Route through effect chain if present, otherwise direct to gain
            if (chain) {
              newSource.connect(chain.input);
            } else if (gain) {
              newSource.connect(gain);
            }
            mixMicSourceRef.current = newSource;
            console.log("[LiveKit] Mix mic switched to new input device");
          }
        } catch (err) {
          console.error("[LiveKit] Error switching mix input device:", err);
          // The old capture is already gone on the release-first path, and stop() raises
          // no event, so the watchdog is told rather than left waiting for one. The mix
          // can also have been torn down while getUserMedia was pending, and that
          // teardown already released everything.
          if (!releaseFirst || mixCtxRef.current !== ctx || !mixPubRef.current) return;
          dropMixCapture(lk);
          setMicStopped(true);
          setSingingError(MIC_STOPPED_MESSAGE);
        }
      })();
    } else {
      // Normal path: let LiveKit handle it
      void room.switchActiveDevice("audioinput", captureDeviceId).catch((err) => {
        console.error("[LiveKit] Error switching input device:", err);
      });
    }
  }, [captureDeviceId, isConnected]);
}

// --- Switch mic mode without reconnecting ---
// Republish the mic track with new audio processing constraints.

export function useMicModeSwitch(
  lk: LiveKitCtx,
  micMode: MicMode,
  isConnected: boolean,
  isMicEnabled: boolean,
  talkingNC: boolean,
  singingNC: boolean,
): void {
  const { roomRef, prevMicModeRef, micCheckAbortRef, mixOwnsMicRef, singingNCRef, talkingNCRef } = lk;

  useEffect(() => {
    if (prevMicModeRef.current === micMode) return;

    const room = roomRef.current;
    // Skip if the mix owns the mic (it already uses raw mode) or a mic check is
    // running: republishing there would put a live managed mic back in the room.
    if (!room || !isConnected || !isMicEnabled || mixOwnsMicRef.current || micCheckAbortRef.current) {
      // Still update ref so we don't re-fire when the guard clears
      prevMicModeRef.current = micMode;
      return;
    }

    // Update ref only after passing the guard, so a skipped switch
    // retries when isMicEnabled becomes true again
    prevMicModeRef.current = micMode;

    const isRaw = micMode === "raw";
    console.log("[LiveKit] Switching mic mode to:", micMode);

    // Unpublish current mic, then re-enable with new constraints
    void (async () => {
      try {
        await room.localParticipant.setMicrophoneEnabled(false);
        // Use NC toggle for the target mode
        const nc = isRaw ? singingNCRef.current : talkingNCRef.current;
        room.options.audioCaptureDefaults = {
          ...room.options.audioCaptureDefaults,
          echoCancellation: nc,
          noiseSuppression: nc,
          autoGainControl: nc,
          channelCount: isRaw ? 2 : 1,
          sampleRate: isRaw ? 48000 : undefined,
        };
        await room.localParticipant.setMicrophoneEnabled(true);
        console.log("[LiveKit] Mic mode switched to", micMode);
      } catch (err) {
        console.error("[LiveKit] Error switching mic mode:", err);
      }
    })();
  }, [micMode, isConnected, isMicEnabled, talkingNC, singingNC]);
}

// Re-publish the normal microphone when noise cancellation changes for the
// active profile. The singing mix has its own hot-swap path in capture.

export function useNCRepublish(
  lk: LiveKitCtx,
  micMode: MicMode,
  talkingNC: boolean,
  singingNC: boolean,
  isConnected: boolean,
  isMicEnabled: boolean,
): void {
  const {
    roomRef,
    prevTalkingNCRef,
    prevPublishedSingingNCRef,
    micCheckAbortRef,
    mixOwnsMicRef,
  } = lk;

  useEffect(() => {
    const talkingChanged = prevTalkingNCRef.current !== talkingNC;
    const singingChanged = prevPublishedSingingNCRef.current !== singingNC;
    prevTalkingNCRef.current = talkingNC;
    prevPublishedSingingNCRef.current = singingNC;

    const activeProfileChanged = micMode === "voice" ? talkingChanged : singingChanged;
    const room = roomRef.current;
    // A running mic check has muted the managed mic on purpose: stopMicCheck syncs
    // the new NC to the room when it restores it.
    if (!activeProfileChanged || !room || !isConnected || !isMicEnabled || mixOwnsMicRef.current || micCheckAbortRef.current) return;

    const isRaw = micMode === "raw";
    const nc = isRaw ? singingNC : talkingNC;
    void (async () => {
      try {
        await room.localParticipant.setMicrophoneEnabled(false);
        room.options.audioCaptureDefaults = {
          ...room.options.audioCaptureDefaults,
          echoCancellation: nc,
          noiseSuppression: nc,
          autoGainControl: nc,
          channelCount: isRaw ? 2 : 1,
          sampleRate: isRaw ? 48000 : undefined,
        };
        await room.localParticipant.setMicrophoneEnabled(true);
      } catch (err) {
        console.error("[LiveKit] Error updating noise cancellation:", err);
      }
    })();
  }, [talkingNC, singingNC, micMode, isConnected, isMicEnabled]);
}

// --- Switch output device without reconnecting ---

export function useOutputDeviceSwitch(
  lk: LiveKitCtx,
  selectedOutputDeviceId: string,
  isConnected: boolean,
): void {
  const { roomRef, mixer, micCheckCtxRef } = lk;

  useEffect(() => {
    const room = roomRef.current;
    if (!room || !isConnected || !selectedOutputDeviceId) return;

    // Every remote voice leaves through the mixer, so it carries the routing
    mixer.setSinkId(selectedOutputDeviceId);

    // Only switch output if the browser supports it (setSinkId / speaker-selection)
    const supportsOutput = typeof HTMLAudioElement.prototype.setSinkId === "function";
    if (!supportsOutput) {
      console.log("[LiveKit] Browser does not support audio output selection - skipping");
      return;
    }

    console.log("[LiveKit] Switching audio output to device:", selectedOutputDeviceId);
    void room.switchActiveDevice("audiooutput", selectedOutputDeviceId).catch(() => {
      // Silently ignore - some browsers don't support this
    });

    document.querySelectorAll<HTMLAudioElement>('audio[id^="lk-audio-"]').forEach((el) => {
      void el.setSinkId(selectedOutputDeviceId).catch(() => {});
    });

    // Also route mic check AudioContext to new output if active
    if (micCheckCtxRef.current && "setSinkId" in micCheckCtxRef.current) {
      void (micCheckCtxRef.current as unknown as { setSinkId: (id: string) => Promise<void> }).setSinkId(selectedOutputDeviceId).catch(() => {});
    }
  }, [selectedOutputDeviceId, isConnected]);
}
