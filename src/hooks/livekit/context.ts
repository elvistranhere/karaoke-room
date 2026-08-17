"use client";

import { useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { LocalTrackPublication, Room } from "livekit-client";

import type { MicMode } from "../useAudioDevices";
import type { EffectChain, VoiceEffect } from "~/lib/voiceEffects";
import { readPref } from "~/lib/prefs";
import { createVoiceMixer, type VoiceMixer } from "~/lib/voiceMixer";

export interface UseLiveKitParams {
  roomCode: string;
  playerName: string;
  isMyTurn: boolean;
  selectedInputDeviceId: string;
  // Android + Bluetooth route + no explicit input choice, null everywhere else
  builtInInputDeviceId: string | null;
  selectedOutputDeviceId: string;
  micMode: MicMode;
  talkingNC: boolean;  // noise cancellation for talking mode
  singingNC: boolean;  // noise cancellation for singing mode
  // True once the join gesture landed. Every blocked-playback reading before it is the
  // browser's autoplay policy, not the user's state, so nothing may reach the UI yet.
  audioUnlocked: boolean;
}

export type MicCheckState = "idle" | "monitoring-talk" | "monitoring-sing" | "error";

export interface LiveKitState {
  isConnected: boolean;
  error: string | null;
  isMicEnabled: boolean;
  isSinging: boolean;
  singingError: string | null;
  micCheckState: MicCheckState;
  canPlaybackAudio: boolean;
  activeSpeakers: Set<string>;
  mixMicStream: MediaStream | null;
  voiceEffect: VoiceEffect;
  effectWetDry: number;
}

// Every ref and setter shared by connection, capture and micCheck. Created once,
// so every module sees the same identities the single-file hook did.
export interface LiveKitCtx {
  setIsConnected: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setIsMicEnabled: Dispatch<SetStateAction<boolean>>;
  setIsSinging: Dispatch<SetStateAction<boolean>>;
  setSingingError: Dispatch<SetStateAction<string | null>>;
  setMicCheckState: Dispatch<SetStateAction<MicCheckState>>;
  setCanPlaybackAudio: Dispatch<SetStateAction<boolean>>;
  setActiveSpeakers: Dispatch<SetStateAction<Set<string>>>;
  setMixMicStreamState: Dispatch<SetStateAction<MediaStream | null>>;
  setVoiceEffectState: Dispatch<SetStateAction<VoiceEffect>>;
  setEffectWetDryState: Dispatch<SetStateAction<number>>;

  mixer: VoiceMixer;
  roomRef: RefObject<Room | null>;
  tokenRefreshRef: RefObject<ReturnType<typeof setInterval> | null>;
  remoteAudioElsRef: RefObject<Map<string, HTMLAudioElement>>;

  micCheckAbortRef: RefObject<(() => void) | null>;
  micCheckCtxRef: RefObject<AudioContext | null>;
  micCheckSourceRef: RefObject<MediaStreamAudioSourceNode | null>;
  micCheckGainRef: RefObject<GainNode | null>;
  micCheckStreamRef: RefObject<MediaStream | null>;
  micCheckEffectChainRef: RefObject<EffectChain | null>;
  micCheckErrorTimerRef: RefObject<ReturnType<typeof setTimeout> | null>;
  micCheckRestoreMicRef: RefObject<boolean>;
  micCheckPrevMixGainRef: RefObject<number | null>;
  micCheckGenRef: RefObject<number>;
  micCheckInFlightRef: RefObject<boolean>;

  mixCtxRef: RefObject<AudioContext | null>;
  mixMicSourceRef: RefObject<MediaStreamAudioSourceNode | null>;
  mixMicGainRef: RefObject<GainNode | null>;
  mixDestRef: RefObject<MediaStreamAudioDestinationNode | null>;
  mixMicStreamRef: RefObject<MediaStream | null>;
  mixPubRef: RefObject<LocalTrackPublication | null>;
  mixOwnsMicRef: RefObject<boolean>;
  mixMicGainValueRef: RefObject<number>;
  effectChainRef: RefObject<EffectChain | null>;
  isSingingInFlightRef: RefObject<boolean>;

  isTogglingMicRef: RefObject<boolean>;
  micErrorTimerRef: RefObject<ReturnType<typeof setTimeout> | null>;

  micModeRef: RefObject<MicMode>;
  playerNameRef: RefObject<string>;
  audioUnlockedRef: RefObject<boolean>;
  isMicEnabledRef: RefObject<boolean>;
  selectedOutputRef: RefObject<string>;
  talkingNCRef: RefObject<boolean>;
  singingNCRef: RefObject<boolean>;
  voiceEffectRef: RefObject<VoiceEffect>;
  effectWetDryRef: RefObject<number>;

  prevMicModeRef: RefObject<MicMode>;
  prevTalkingNCRef: RefObject<boolean>;
  prevPublishedSingingNCRef: RefObject<boolean>;
  prevSingingNCRef: RefObject<boolean>;
}

export function useLiveKitCtx({
  playerName,
  selectedOutputDeviceId,
  micMode,
  talkingNC,
  singingNC,
  audioUnlocked,
}: UseLiveKitParams): { ctx: LiveKitCtx; state: LiveKitState } {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMicEnabled, setIsMicEnabled] = useState(false);
  const [isSinging, setIsSinging] = useState(false);
  const [singingError, setSingingError] = useState<string | null>(null);

  const [micCheckState, setMicCheckState] = useState<MicCheckState>("idle");
  const [canPlaybackAudio, setCanPlaybackAudio] = useState(true);
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
  const audioUnlockedRef = useRef(audioUnlocked);
  audioUnlockedRef.current = audioUnlocked;

  // Ref mirrors - used in callbacks to avoid stale closures
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
  const micCheckInFlightRef = useRef(false);
  const isTogglingMicRef = useRef(false);
  const micErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const prevMicModeRef = useRef<MicMode>(micMode);
  const prevTalkingNCRef = useRef(talkingNC);
  const prevPublishedSingingNCRef = useRef(singingNC);
  const prevSingingNCRef = useRef(singingNC);

  const ctxRef = useRef<LiveKitCtx | null>(null);
  if (!ctxRef.current) {
    ctxRef.current = {
      setIsConnected,
      setError,
      setIsMicEnabled,
      setIsSinging,
      setSingingError,
      setMicCheckState,
      setCanPlaybackAudio,
      setActiveSpeakers,
      setMixMicStreamState,
      setVoiceEffectState,
      setEffectWetDryState,
      mixer,
      roomRef,
      tokenRefreshRef,
      remoteAudioElsRef,
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
      mixCtxRef,
      mixMicSourceRef,
      mixMicGainRef,
      mixDestRef,
      mixMicStreamRef,
      mixPubRef,
      mixOwnsMicRef,
      mixMicGainValueRef,
      effectChainRef,
      isSingingInFlightRef,
      isTogglingMicRef,
      micErrorTimerRef,
      micModeRef,
      playerNameRef,
      audioUnlockedRef,
      isMicEnabledRef,
      selectedOutputRef,
      talkingNCRef,
      singingNCRef,
      voiceEffectRef,
      effectWetDryRef,
      prevMicModeRef,
      prevTalkingNCRef,
      prevPublishedSingingNCRef,
      prevSingingNCRef,
    };
  }

  return {
    ctx: ctxRef.current,
    state: {
      isConnected,
      error,
      isMicEnabled,
      isSinging,
      singingError,
      micCheckState,
      canPlaybackAudio,
      activeSpeakers,
      mixMicStream: mixMicStreamState,
      voiceEffect,
      effectWetDry,
    },
  };
}
