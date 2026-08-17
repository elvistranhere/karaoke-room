import { describe, expect, it } from "vitest";
import { findBuiltInInputId, isActiveRouteBluetooth, isBluetoothLabel } from "~/lib/audioRoutes";

describe("isBluetoothLabel", () => {
  it("matches the route markers case-insensitively", () => {
    expect(isBluetoothLabel("Elvis's AirPods Pro")).toBe(true);
    expect(isBluetoothLabel("Headset (Bluetooth)")).toBe(true);
    expect(isBluetoothLabel("WH-1000XM5 Hands-Free AG Audio")).toBe(true);
    expect(isBluetoothLabel("Sony HFP")).toBe(true);
  });

  it("matches the bare product names macOS and iOS report", () => {
    expect(isBluetoothLabel("WH-1000XM5")).toBe(true);
    expect(isBluetoothLabel("WF-1000XM5")).toBe(true);
    expect(isBluetoothLabel("Galaxy Buds2 Pro")).toBe(true);
    expect(isBluetoothLabel("Bose QC45")).toBe(true);
    expect(isBluetoothLabel("Beats Fit Pro")).toBe(true);
    expect(isBluetoothLabel("Jabra Elite 8")).toBe(true);
    expect(isBluetoothLabel("JBL Tune 760NC")).toBe(true);
  });

  it("matches the Windows A2DP output form and LE Audio names", () => {
    expect(isBluetoothLabel("Headphones (WH-1000XM5 Stereo)")).toBe(true);
    expect(isBluetoothLabel("Headphones (LE_WF-1000XM5)")).toBe(true);
  });

  it("does not match wired or built-in labels", () => {
    expect(isBluetoothLabel("MacBook Pro Microphone")).toBe(false);
    expect(isBluetoothLabel("Default - Built-in Microphone")).toBe(false);
    expect(isBluetoothLabel("USB Audio Device")).toBe(false);
    expect(isBluetoothLabel("Wired headset")).toBe(false);
    expect(isBluetoothLabel("Speakers (Realtek High Definition Audio)")).toBe(false);
  });
});

describe("isActiveRouteBluetooth", () => {
  it("ignores a paired headset that is not the selected route", () => {
    const outputs = [
      { deviceId: "default", label: "Default - Speakers (Realtek High Definition Audio)" },
      { deviceId: "spk", label: "Speakers (Realtek High Definition Audio)" },
      { deviceId: "bt", label: "Headphones (WH-1000XM4 Stereo)" },
    ];
    expect(isActiveRouteBluetooth(outputs, "spk")).toBe(false);
    expect(isActiveRouteBluetooth(outputs, "bt")).toBe(true);
  });

  it("falls back to the default entry when nothing is selected yet", () => {
    const outputs = [
      { deviceId: "default", label: "Default - AirPods Pro" },
      { deviceId: "spk", label: "MacBook Pro Speakers" },
    ];
    expect(isActiveRouteBluetooth(outputs, "")).toBe(true);
  });

  it("is false with no devices", () => {
    expect(isActiveRouteBluetooth([], "")).toBe(false);
  });
});

describe("findBuiltInInputId", () => {
  it("prefers a built-in looking input over a Bluetooth one", () => {
    expect(
      findBuiltInInputId([
        { deviceId: "bt", label: "Pixel Buds Pro (Bluetooth)" },
        { deviceId: "phone", label: "Built-in microphone" },
      ]),
    ).toBe("phone");
  });

  it("rejects the route-following pseudo-devices, which follow the headset", () => {
    expect(findBuiltInInputId([{ deviceId: "default", label: "Default" }])).toBeNull();
    expect(findBuiltInInputId([{ deviceId: "communications", label: "Communications" }])).toBeNull();
  });

  it("does not read 'phone' out of microphone or headphone labels", () => {
    expect(findBuiltInInputId([{ deviceId: "u", label: "USB Microphone" }])).toBeNull();
    expect(findBuiltInInputId([{ deviceId: "h", label: "Headphone microphone" }])).toBeNull();
  });

  it("never returns a Bluetooth device that also carries a built-in marker", () => {
    expect(findBuiltInInputId([{ deviceId: "bt", label: "Default - AirPods" }])).toBeNull();
  });

  it("returns null when nothing looks built-in", () => {
    expect(findBuiltInInputId([{ deviceId: "u", label: "USB Mic" }])).toBeNull();
  });
});
