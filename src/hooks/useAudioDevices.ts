"use client";

import { useCallback, useEffect, useState } from "react";

export interface AudioDevice {
  deviceId: string;
  label: string;
}

interface UseAudioDevicesReturn {
  inputDevices: AudioDevice[];
  outputDevices: AudioDevice[];
  selectedInputId: string;
  selectedOutputId: string;
  setSelectedInputId: (id: string) => void;
  setSelectedOutputId: (id: string) => void;
  refreshDevices: () => Promise<void>;
}

export function useAudioDevices(): UseAudioDevicesReturn {
  const [inputDevices, setInputDevices] = useState<AudioDevice[]>([]);
  const [outputDevices, setOutputDevices] = useState<AudioDevice[]>([]);
  const [selectedInputId, setSelectedInputId] = useState<string>("");
  const [selectedOutputId, setSelectedOutputId] = useState<string>("");

  const refreshDevices = useCallback(async () => {
    try {
      // Need to request mic permission first to get device labels
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Stop immediately — we just needed permission
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

      // Set defaults if not already set
      if (!selectedInputId && inputs.length > 0) {
        setSelectedInputId(inputs[0]!.deviceId);
      }
      if (!selectedOutputId && outputs.length > 0) {
        setSelectedOutputId(outputs[0]!.deviceId);
      }

      console.log("[AudioDevices] Found", inputs.length, "inputs,", outputs.length, "outputs");
    } catch (err) {
      console.error("[AudioDevices] Error enumerating devices:", err);
    }
  }, [selectedInputId, selectedOutputId]);

  // Refresh on mount and when devices change
  useEffect(() => {
    void refreshDevices();

    const handler = () => void refreshDevices();
    navigator.mediaDevices.addEventListener("devicechange", handler);
    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", handler);
    };
  }, [refreshDevices]);

  return {
    inputDevices,
    outputDevices,
    selectedInputId,
    selectedOutputId,
    setSelectedInputId,
    setSelectedOutputId,
    refreshDevices,
  };
}
