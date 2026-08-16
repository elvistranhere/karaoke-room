"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteParticipant,
  ConnectionState,
  type LocalTrackPublication,
  AudioPresets,
  DisconnectReason,
} from "livekit-client";

import type { MicMode } from "./useAudioDevices";
import { createEffectChain, type VoiceEffect, type EffectChain } from "~/lib/voiceEffects";
import { readPref, writePref } from "~/lib/prefs";
import { createVoiceMixer, type VoiceMixer } from "~/lib/voiceMixer";

// The singer publishes this alongside LiveKit's muted managed mic, so both carry
// Track.Source.Microphone and only the name tells them apart.
export const VOICE_TRACK_NAME = "karaoke-voice";

interface UseLiveKitParams {
  roomCode: string;
  playerName: string;
  isMyTurn: boolean;
  selectedInputDeviceId: string;
  selectedOutputDeviceId: string;
  micMode: MicMode;
  talkingNC: boolean;  // noise cancellation for talking mode
  singingNC: boolean;  // noise cancellation for singing mode
}

export type MicCheckState = "idle" | "monitoring-talk" | "monitoring-sing" | "error";

const MIC_CHECK_GUM_TIMEOUT_MS = 15000;

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

export const MIC_ON_PREF_KEY = "karaoke-mic-on";

interface UseLiveKitReturn {
  room: Room | null;
  isConnected: boolean;
  error: string | null;
  isMicEnabled: boolean;
  toggleMic: () => Promise<void>;
  setMicMuted: (muted: boolean) => Promise<void>;
  micCheckState: MicCheckState;
  startTalkingMicCheck: (noiseCancellation: boolean) => Promise<void>;
  startSingingMicCheck: (noiseCancellation: boolean) => Promise<void>;
  stopMicCheck: () => void;
  isSinging: boolean;
  startSinging: () => Promise<void>;
  stopSinging: () => void;
  singingError: string | null;
  activeSpeakers: Set<string>;
  setMixMicGain: (val: number) => void;
  mixer: VoiceMixer;
  voiceEffect: VoiceEffect;
  setVoiceEffect: (effect: VoiceEffect) => void;
  effectWetDry: number;
  setEffectWetDry: (wet: number) => void;
  // Mix mic stream (for status bar level meter while singing)
  mixMicStream: MediaStream | null;
}

export function useLiveKit({
  roomCode,
  playerName,
  isMyTurn,
  selectedInputDeviceId,
  selectedOutputDeviceId,
  micMode,
  talkingNC,
  singingNC,
}: UseLiveKitParams): UseLiveKitReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMicEnabled, setIsMicEnabled] = useState(false);
  const [isSinging, setIsSinging] = useState(false);
  const [singingError, setSingingError] = useState<string | null>(null);

  const [micCheckState, setMicCheckState] = useState<MicCheckState>("idle");
  const [activeSpeakers, setActiveSpeakers] = useState<Set<string>>(new Set());

  const roomRef = useRef<Room | null>(null);
  const mixerRef = useRef<VoiceMixer | null>(null);
  if (!mixerRef.current) mixerRef.current = createVoiceMixer();
  const mixer = mixerRef.current;
  const micCheckAbortRef = useRef<(() => void) | null>(null);
  // Mic check Web Audio refs, stored so effects can hot-swap NC/effect during monitoring
  const micCheckCtxRef = useRef<AudioContext | null>(null);
  const micCheckSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micCheckGainRef = useRef<GainNode | null>(null);
  const micCheckStreamRef = useRef<MediaStream | null>(null);
  const micCheckEffectChainRef = useRef<EffectChain | null>(null);
  const micCheckErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const micCheckRestoreMicRef = useRef(false);
  const micCheckPrevMixGainRef = useRef<number | null>(null);
  const mixMicGainValueRef = useRef(1); // last slider value, applied when the pipeline (re)builds
  const isSingingInFlightRef = useRef(false); // guard against concurrent startSinging/stopSinging
  const micModeRef = useRef<MicMode>(micMode);
  micModeRef.current = micMode;
  const playerNameRef = useRef(playerName);
  playerNameRef.current = playerName;

  // Ref mirrors — used in callbacks to avoid stale closures
  const isMicEnabledRef = useRef(isMicEnabled);
  isMicEnabledRef.current = isMicEnabled;
  const selectedOutputRef = useRef(selectedOutputDeviceId);
  selectedOutputRef.current = selectedOutputDeviceId;
  const talkingNCRef = useRef(talkingNC);
  talkingNCRef.current = talkingNC;
  const singingNCRef = useRef(singingNC);
  singingNCRef.current = singingNC;

  // While singing, the mic runs through the voice effect chain into a dedicated
  // AudioContext destination and is published as one track. Music no longer
  // travels over LiveKit: every client plays the YouTube video locally.
  const mixCtxRef = useRef<AudioContext | null>(null);
  const mixMicSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const mixMicGainRef = useRef<GainNode | null>(null);
  const mixDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const mixMicStreamRef = useRef<MediaStream | null>(null); // raw mic capture
  const [mixMicStreamState, setMixMicStreamState] = useState<MediaStream | null>(null);
  const mixPubRef = useRef<LocalTrackPublication | null>(null);
  const effectChainRef = useRef<EffectChain | null>(null);
  const [voiceEffect, setVoiceEffectState] = useState<VoiceEffect>(() => {
    const saved = readPref("karaoke-voice-effect");
    return saved === "hall" || saved === "echo" || saved === "warm" || saved === "bright" || saved === "chorus" ? saved : "none";
  });
  // Seeded from the stored effect: the audio chain reads the ref, so leaving it at the
  // default would silently drop the restored effect until the next manual change
  const voiceEffectRef = useRef<VoiceEffect>(voiceEffect);
  const [effectWetDry, setEffectWetDryState] = useState(() => {
    const raw = readPref("karaoke-effect-wetdry");
    const saved = raw === null ? NaN : Number(raw);
    return Number.isFinite(saved) && saved >= 0 && saved <= 1 ? saved : 0.5;
  });
  const effectWetDryRef = useRef(effectWetDry); // synchronous value for active audio chains

  const tokenRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // The hook owns the elements it appended: LiveKit empties attachedElements before
  // it emits TrackUnsubscribed, so track.detach() can no longer find them.
  const remoteAudioElsRef = useRef(new Map<string, HTMLAudioElement>());
  const micCheckGenRef = useRef(0);
  const mixOwnsMicRef = useRef(false);

  // --- Connect to LiveKit room ---

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
        deviceId: selectedInputDeviceId || undefined,
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
        // Force play — may fail due to autoplay policy, but startAudio handles that
        el.play().catch(() => {
          console.log("[LiveKit] Autoplay blocked for", participant.identity, "— will resume on user click");
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

    // Active speakers — highlight who is talking
    room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      if (cancelled) return;
      // Include local participant if they're speaking
      const identities = new Set(speakers.map((p) => p.identity));
      if (room.localParticipant.isSpeaking) {
        identities.add(room.localParticipant.identity);
      }
      setActiveSpeakers(identities);
    });

    // Connection state — including reconnect awareness
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
        const url = (data.url && data.url.startsWith("wss://")) ? data.url : process.env.NEXT_PUBLIC_LIVEKIT_URL;
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
        // Browsers block autoplay — also retried via manual click/keydown listeners below.
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

    // Resume audio on user interaction (autoplay policy workaround).
    // Fires on each interaction until audio context is running, then no-ops.
    let audioResumed = false;
    const resumeAudio = () => {
      mixer.resume();
      if (audioResumed) return;
      room.startAudio().then(() => {
        audioResumed = true;
        document.querySelectorAll<HTMLAudioElement>('audio[id^="lk-audio-"]').forEach((el) => {
          if (el.paused) el.play().catch(() => {});
        });
      }).catch(() => {}).finally(() => {
        // startAudio sets muted = false on every attached element
        mixer.syncElements();
      });
      // Also try immediately
      document.querySelectorAll<HTMLAudioElement>('audio[id^="lk-audio-"]').forEach((el) => {
        if (el.paused) el.play().catch(() => {});
      });
    };
    // Returning to the tab after an interruption (call, backgrounding) is the other
    // moment a suspended context can come back without waiting for a tap
    const resumeOnVisible = () => {
      if (document.visibilityState === "visible") resumeAudio();
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
      setIsMicEnabled(false);
      setIsSinging(false);
    };
    // playerName uses a ref — name changes only go through PartyKit, not LiveKit.
    // micMode is NOT included — handled by a separate effect that republishes the mic track.
    // selectedInputDeviceId/selectedOutputDeviceId are NOT included — handled by separate effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode]);

  // --- Switch input device without reconnecting ---

  useEffect(() => {
    const room = roomRef.current;
    if (!room || !isConnected || !selectedInputDeviceId) return;

    console.log("[LiveKit] Switching mic input to device:", selectedInputDeviceId);

    // If mix is active, re-capture the mic from the new device
    if (mixPubRef.current && mixMicStreamRef.current) {
      const ctx = mixCtxRef.current;
      void (async () => {
        try {
          const nc = singingNCRef.current;
          const newStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: { exact: selectedInputDeviceId },
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
            newStream.getTracks().forEach((t) => t.stop());
            return;
          }

          mixMicStreamRef.current?.getTracks().forEach((t) => t.stop());
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
        }
      })();
    } else {
      // Normal path: let LiveKit handle it
      void room.switchActiveDevice("audioinput", selectedInputDeviceId).catch((err) => {
        console.error("[LiveKit] Error switching input device:", err);
      });
    }
  }, [selectedInputDeviceId, isConnected]);

  // --- Switch mic mode without reconnecting ---
  // Republish the mic track with new audio processing constraints.

  const prevMicModeRef = useRef<MicMode>(micMode);
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

  // Re-publish the normal microphone when noise cancellation changes for the
  // active profile. The singing mix has its own hot-swap path below.
  const prevTalkingNCRef = useRef(talkingNC);
  const prevPublishedSingingNCRef = useRef(singingNC);
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

  // --- Hot-swap NC while singing ---
  // When NC toggle changes while singing, re-capture mic with new constraints
  const prevSingingNCRef = useRef(singingNC);
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

  // --- Switch output device without reconnecting ---

  useEffect(() => {
    const room = roomRef.current;
    if (!room || !isConnected || !selectedOutputDeviceId) return;

    // Every remote voice leaves through the mixer, so it carries the routing
    mixer.setSinkId(selectedOutputDeviceId);

    // Only switch output if the browser supports it (setSinkId / speaker-selection)
    const supportsOutput = typeof HTMLAudioElement.prototype.setSinkId === "function";
    if (!supportsOutput) {
      console.log("[LiveKit] Browser does not support audio output selection — skipping");
      return;
    }

    console.log("[LiveKit] Switching audio output to device:", selectedOutputDeviceId);
    void room.switchActiveDevice("audiooutput", selectedOutputDeviceId).catch(() => {
      // Silently ignore — some browsers don't support this
    });

    document.querySelectorAll<HTMLAudioElement>('audio[id^="lk-audio-"]').forEach((el) => {
      void el.setSinkId(selectedOutputDeviceId).catch(() => {});
    });

    // Also route mic check AudioContext to new output if active
    if (micCheckCtxRef.current && "setSinkId" in micCheckCtxRef.current) {
      void (micCheckCtxRef.current as unknown as { setSinkId: (id: string) => Promise<void> }).setSinkId(selectedOutputDeviceId).catch(() => {});
    }
  }, [selectedOutputDeviceId, isConnected]);

  // --- Real-time mic check (live loopback) ---
  // Routes mic audio through Web Audio API directly to speakers so you hear
  // yourself in real-time. Mutes all remote audio during monitoring to avoid
  // confusion. Toggle on/off — no record-and-playback delay.

  const micCheckInFlightRef = useRef(false);

  // One duck gain on the mixer bus hushes every remote voice for the check
  const muteRemoteAudio = useCallback(() => {
    mixer.setDuck(0);
  }, [mixer]);

  const restoreRemoteAudio = useCallback(() => {
    mixer.setDuck(1);
  }, [mixer]);

  // Sync Room's audioCaptureDefaults to current NC before restoring managed mic
  const syncNCToRoom = useCallback(() => {
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

    try {
      const stream = await getMicStreamWithTimeout({
        audio: {
          deviceId: selectedInputDeviceId ? { exact: selectedInputDeviceId } : undefined,
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
      if (!track) { micCheckInFlightRef.current = false; return; }

      // Route mic → speakers via AudioContext
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const gain = ctx.createGain();
      gain.gain.value = 1.0;
      source.connect(gain);
      gain.connect(ctx.destination);
      if (ctx.state === "suspended") await ctx.resume().catch(() => {});
      if (gen !== micCheckGenRef.current) {
        track.stop();
        void ctx.close();
        return;
      }
      if (ctx.state === "suspended") {
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
      setMicCheckState("error");
      scheduleMicCheckErrorReset();
    }
  }, [micCheckState, selectedInputDeviceId, muteRemoteAudio, isolateMicCheckFromRoom, scheduleMicCheckErrorReset, stopMicCheck]);

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

    try {
      const stream = await getMicStreamWithTimeout({
        audio: {
          deviceId: selectedInputDeviceId ? { exact: selectedInputDeviceId } : undefined,
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
      if (!rawTrack) { micCheckInFlightRef.current = false; return; }

      // Route mic → effect chain → speakers
      const ctx = new AudioContext({ sampleRate: 48000 });
      const source = ctx.createMediaStreamSource(stream);
      const chain = createEffectChain(ctx, voiceEffectRef.current);
      const gain = ctx.createGain();
      gain.gain.value = 1.0;

      source.connect(chain.input);
      chain.output.connect(gain);
      gain.connect(ctx.destination);
      if (ctx.state === "suspended") await ctx.resume().catch(() => {});
      if (gen !== micCheckGenRef.current) {
        rawTrack.stop();
        chain.cleanup();
        void ctx.close();
        return;
      }
      if (ctx.state === "suspended") {
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
      setMicCheckState("error");
      scheduleMicCheckErrorReset();
    }
  }, [micCheckState, selectedInputDeviceId, muteRemoteAudio, isolateMicCheckFromRoom, scheduleMicCheckErrorReset, stopMicCheck]);

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
            deviceId: selectedInputDeviceId ? { exact: selectedInputDeviceId } : undefined,
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
            deviceId: selectedInputDeviceId ? { exact: selectedInputDeviceId } : undefined,
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

  // --- Microphone ---

  const isTogglingMicRef = useRef(false);
  const micErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // persist is false for forced changes (mute-all, deafen): only a deliberate toggle
  // may rewrite the join preference
  const applyMicState = useCallback(async (newState: boolean, persist: boolean) => {
    const room = roomRef.current;
    if (!room || !room.localParticipant || isTogglingMicRef.current) return;

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
        ? "Mic permission needed — click Unmute again"
        : errName === "NotFoundError"
          ? "No microphone found — check your device"
          : (err instanceof Error ? err.message : "Mic failed");
      setError(msg);
      // Clear previous timer, schedule new one — only one timer active at a time
      if (micErrorTimerRef.current) clearTimeout(micErrorTimerRef.current);
      if (isTransient) {
        micErrorTimerRef.current = setTimeout(() => {
          setError((prev) => prev === msg ? null : prev);
          micErrorTimerRef.current = null;
        }, 3000);
      }
    } finally {
      isTogglingMicRef.current = false;
    }
  }, [selectedInputDeviceId, detachMicFromMix]);

  const toggleMic = useCallback(async () => {
    await applyMicState(!isMicEnabledRef.current, true);
  }, [applyMicState]);

  // Force mute/unmute - used by mute-all to handle both the singing and idle paths.
  // Unlike toggleMic, this sets a specific state rather than toggling.
  const setMicMuted = useCallback(async (muted: boolean) => {
    const currentlyEnabled = isMicEnabledRef.current;
    if ((muted && !currentlyEnabled) || (!muted && currentlyEnabled)) return; // already in desired state
    await applyMicState(!muted, false);
  }, [applyMicState]);

  // --- Singing voice pipeline ---
  // Mic runs through the voice effect chain into a MediaStreamDestination and is
  // published as one LiveKit track. Music is played locally by every client.

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
    if (!room || !room.localParticipant || isSingingInFlightRef.current) {
      if (!room) setSingingError("Not connected");
      return;
    }

    isSingingInFlightRef.current = true;
    // Claimed before the first await so no other path re-arms the managed mic
    // while the pipeline is still being built.
    mixOwnsMicRef.current = true;
    try {
      // Auto-enable the mic when taking the stage so the singer can be heard.
      // They can still mute afterwards.
      if (!isMicEnabledRef.current) {
        isMicEnabledRef.current = true;
        setIsMicEnabled(true);
      }
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

  return {
    room: roomRef.current,
    isConnected,
    error,
    isMicEnabled,
    toggleMic,
    setMicMuted,
    micCheckState,
    startTalkingMicCheck,
    startSingingMicCheck,
    stopMicCheck,
    isSinging,
    startSinging,
    stopSinging,
    singingError,
    activeSpeakers,
    setMixMicGain,
    mixer,
    voiceEffect,
    setVoiceEffect,
    effectWetDry,
    setEffectWetDry,
    mixMicStream: mixMicStreamState,
  };
}
