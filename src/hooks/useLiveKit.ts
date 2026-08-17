"use client";

import { useCallback } from "react";
import type { Room } from "livekit-client";

import type { VoiceEffect } from "~/lib/voiceEffects";
import type { VoiceMixer } from "~/lib/voiceMixer";
import { useCapture, useSingingNCHotSwap } from "./livekit/capture";
import {
  resumeRoomAudio,
  useInputDeviceSwitch,
  useMicModeSwitch,
  useNCRepublish,
  useOutputDeviceSwitch,
  useRoomConnection,
  useSyncNCToRoom,
} from "./livekit/connection";
import { useLiveKitCtx, type MicCheckState, type UseLiveKitParams } from "./livekit/context";
import { useMicCheck } from "./livekit/micCheck";

export { VOICE_TRACK_NAME, MIC_ON_PREF_KEY } from "./livekit/capture";
export type { MicCheckState } from "./livekit/context";

interface UseLiveKitReturn {
  room: Room | null;
  isConnected: boolean;
  error: string | null;
  isMicEnabled: boolean;
  toggleMic: (target?: boolean) => Promise<void>;
  setMicMuted: (muted: boolean) => Promise<void>;
  micCheckState: MicCheckState;
  // LiveKit's own verdict: the browser refused to play remote voices on this device
  voicePlaybackBlocked: boolean;
  // The room's one audio recovery, safe to call from any gesture at any time
  resumeVoicePlayback: () => void;
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

export function useLiveKit(params: UseLiveKitParams): UseLiveKitReturn {
  const {
    roomCode,
    isMyTurn,
    selectedInputDeviceId,
    builtInInputDeviceId,
    selectedOutputDeviceId,
    micMode,
    talkingNC,
    singingNC,
  } = params;

  // One device id governs every getUserMedia and switchActiveDevice in the hook.
  // builtInInputDeviceId is non-null only on Android with a Bluetooth input route
  // and no explicit user choice, so an explicit selection always wins.
  const captureDeviceId = builtInInputDeviceId ?? selectedInputDeviceId;

  const { ctx, state } = useLiveKitCtx(params);
  const syncNCToRoom = useSyncNCToRoom(ctx);

  // The effects below run in the order the single-file hook ran them: the singing
  // NC hot-swap sits between the mic-mode republish and the output switch.
  useRoomConnection(ctx, roomCode, captureDeviceId, selectedOutputDeviceId);
  useInputDeviceSwitch(ctx, captureDeviceId, state.isConnected);
  useMicModeSwitch(ctx, micMode, state.isConnected, state.isMicEnabled, talkingNC, singingNC);
  useNCRepublish(ctx, micMode, talkingNC, singingNC, state.isConnected, state.isMicEnabled);
  useSingingNCHotSwap(ctx, singingNC, captureDeviceId);
  useOutputDeviceSwitch(ctx, selectedOutputDeviceId, state.isConnected);

  const resumeVoicePlayback = useCallback(() => {
    const room = ctx.roomRef.current;
    void resumeRoomAudio(room, ctx.mixer).then(() => {
      ctx.setCanPlaybackAudio(room ? room.canPlaybackAudio : true);
    });
  }, [ctx]);

  const { startTalkingMicCheck, startSingingMicCheck, stopMicCheck } = useMicCheck(
    ctx,
    state.micCheckState,
    captureDeviceId,
    talkingNC,
    singingNC,
    state.voiceEffect,
    syncNCToRoom,
  );

  const {
    toggleMic,
    setMicMuted,
    setMixMicGain,
    setVoiceEffect,
    setEffectWetDry,
    startSinging,
    stopSinging,
  } = useCapture(ctx, captureDeviceId, state.isSinging, isMyTurn, syncNCToRoom, stopMicCheck);

  return {
    room: ctx.roomRef.current,
    isConnected: state.isConnected,
    error: state.error,
    isMicEnabled: state.isMicEnabled,
    toggleMic,
    setMicMuted,
    micCheckState: state.micCheckState,
    voicePlaybackBlocked: !state.canPlaybackAudio,
    resumeVoicePlayback,
    startTalkingMicCheck,
    startSingingMicCheck,
    stopMicCheck,
    isSinging: state.isSinging,
    startSinging,
    stopSinging,
    singingError: state.singingError,
    activeSpeakers: state.activeSpeakers,
    setMixMicGain,
    mixer: ctx.mixer,
    voiceEffect: state.voiceEffect,
    setVoiceEffect,
    effectWetDry: state.effectWetDry,
    setEffectWetDry,
    mixMicStream: state.mixMicStream,
  };
}
