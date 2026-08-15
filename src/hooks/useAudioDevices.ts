"use client";

import { useCallback, useEffect, useState } from "react";
import { readPref, writePref } from "~/lib/prefs";

const INPUT_PREF_KEY = "karaoke-input-device";
const OUTPUT_PREF_KEY = "karaoke-output-device";

export interface AudioDevice {
  deviceId: string;
  label: string;
}

export type MicMode = "voice" | "raw";

interface UseAudioDevicesReturn {
  inputDevices: AudioDevice[];
  outputDevices: AudioDevice[];
  selectedInputId: string;
  selectedOutputId: string;
  setSelectedInputId: (id: string) => void;
  setSelectedOutputId: (id: string) => void;
  micMode: MicMode;
  setMicMode: (mode: MicMode) => void;
  refreshDevices: () => Promise<void>;
}

export function useAudioDevices(): UseAudioDevicesReturn {
  const [inputDevices, setInputDevices] = useState<AudioDevice[]>([]);
  const [outputDevices, setOutputDevices] = useState<AudioDevice[]>([]);
  const [selectedInputId, setSelectedInputId] = useState<string>("");
  const [selectedOutputId, setSelectedOutputId] = useState<string>("");
  const [micMode, setMicMode] = useState<MicMode>("voice");

  const refreshDevices = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      for (const track of stream.getTracks()) track.stop();

      const devices = await navigator.mediaDevices.enumerateDevices();

      const inputs = devices
        .filter((d) => d.kind === "audioinput" && d.deviceId)
        .map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${i + 1}`,
        }));

      const outputs = devices
        .filter((d) => d.kind === "audiooutput" && d.deviceId)
        .map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || `Speaker ${i + 1}`,
        }));

      setInputDevices(inputs);
      setOutputDevices(outputs);

      // Restore the remembered device only when it is actually plugged in;
      // a stale exact deviceId constraint would make getUserMedia throw
      if (!selectedInputId && inputs.length > 0) {
        const saved = readPref(INPUT_PREF_KEY);
        const match = saved ? inputs.find((d) => d.deviceId === saved) : undefined;
        setSelectedInputId((match ?? inputs[0]!).deviceId);
      }
      if (!selectedOutputId && outputs.length > 0) {
        const saved = readPref(OUTPUT_PREF_KEY);
        const match = saved ? outputs.find((d) => d.deviceId === saved) : undefined;
        setSelectedOutputId((match ?? outputs[0]!).deviceId);
      }
    } catch (err) {
      console.error("[AudioDevices] Error:", err);
    }
  }, [selectedInputId, selectedOutputId]);

  useEffect(() => {
    void refreshDevices();
    const handler = () => void refreshDevices();
    navigator.mediaDevices.addEventListener("devicechange", handler);
    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", handler);
    };
  }, [refreshDevices]);

  const rememberInput = useCallback((id: string) => {
    setSelectedInputId(id);
    writePref(INPUT_PREF_KEY, id);
  }, []);

  const rememberOutput = useCallback((id: string) => {
    setSelectedOutputId(id);
    writePref(OUTPUT_PREF_KEY, id);
  }, []);

  return {
    inputDevices,
    outputDevices,
    selectedInputId,
    selectedOutputId,
    setSelectedInputId: rememberInput,
    setSelectedOutputId: rememberOutput,
    micMode,
    setMicMode,
    refreshDevices,
  };
}
