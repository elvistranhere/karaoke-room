"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { findBuiltInInputId, isActiveRouteBluetooth, isAndroidDevice } from "~/lib/audioRoutes";
import { beginAudioCapture, endAudioCapture, hasAudioCaptureOwner } from "~/lib/audioSession";
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
  bluetoothDetected: boolean;
  builtInInputDeviceId: string | null;
}

export function useAudioDevices(): UseAudioDevicesReturn {
  const [inputDevices, setInputDevices] = useState<AudioDevice[]>([]);
  const [outputDevices, setOutputDevices] = useState<AudioDevice[]>([]);
  const [selectedInputId, setSelectedInputId] = useState<string>("");
  const [selectedOutputId, setSelectedOutputId] = useState<string>("");
  const [micMode, setMicMode] = useState<MicMode>("voice");
  // Only a stored or clicked choice counts as explicit; the inputs[0] fallback below
  // is the app picking for the user and may be overridden on a Bluetooth route.
  const [inputIsExplicit, setInputIsExplicit] = useState(false);

  // Labels survive the probe for the life of the document, so a second one buys
  // nothing and a devicechange fires exactly when a capture is most likely to be live.
  const labelsGrantedRef = useRef(false);

  const refreshDevices = useCallback(async () => {
    try {
      // A headset connecting mid-song is a devicechange, and a bare getUserMedia there
      // would be the second capture that permanently mutes the singer's on iOS. The
      // owner set is the app's one record of a live capture, so it decides.
      if (!labelsGrantedRef.current && !hasAudioCaptureOwner()) {
        // Labels need permission, and this probe is a capture like any other: it has
        // to own the audio session or a "playback" write lands under a live mic.
        beginAudioCapture("probe");
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          for (const track of stream.getTracks()) track.stop();
          labelsGrantedRef.current = true;
        } finally {
          endAudioCapture("probe");
        }
      }

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
        if (match) setInputIsExplicit(true);
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
    setInputIsExplicit(true);
    writePref(INPUT_PREF_KEY, id);
  }, []);

  const rememberOutput = useCallback((id: string) => {
    setSelectedOutputId(id);
    writePref(OUTPUT_PREF_KEY, id);
  }, []);

  // The route in use, not the inventory: a headset that is merely paired while the
  // user is already on speakers must not be told to stop using Bluetooth.
  const inputRouteIsBluetooth = useMemo(
    () => isActiveRouteBluetooth(inputDevices, selectedInputId),
    [inputDevices, selectedInputId],
  );
  const bluetoothDetected = useMemo(
    () => inputRouteIsBluetooth || isActiveRouteBluetooth(outputDevices, selectedOutputId),
    [inputRouteIsBluetooth, outputDevices, selectedOutputId],
  );

  // Android only: Chromium flips the link to SCO when the headset mic opens, so the
  // built-in mic is what keeps A2DP. iOS routes to HFP whatever deviceId we ask for.
  // Gated on the input route alone, because Chrome on Android enumerates no outputs.
  const builtInInputDeviceId = useMemo(
    () =>
      inputRouteIsBluetooth && !inputIsExplicit && isAndroidDevice()
        ? findBuiltInInputId(inputDevices)
        : null,
    [inputRouteIsBluetooth, inputIsExplicit, inputDevices],
  );

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
    bluetoothDetected,
    builtInInputDeviceId,
  };
}
