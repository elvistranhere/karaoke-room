/**
 * Bluetooth route detection off enumerateDevices labels.
 * A headset that opens its mic drops the whole link from A2DP to HFP, so the
 * route is worth naming even though the page cannot change it.
 */

export interface AudioDeviceLike {
  deviceId: string;
  label: string;
}

// Most platforms never say "bluetooth": macOS/iOS report the bare product name,
// Windows reports the A2DP side as "Headphones (<product> Stereo)" and only the
// HFP side as "Hands-Free", and LE Audio names carry neither.
const BLUETOOTH_MARKERS = [
  "airpod",
  "bluetooth",
  "hands-free",
  "handsfree",
  "hfp",
  "headset",
  "wireless",
  "buds",
  "beats",
  "jabra",
  "bose",
  "jbl",
  "wh-",
  "wf-",
  "le_",
];

// "Wired headset" is a literal Android label and would otherwise match "headset"
const WIRED_MARKERS = ["wired", "3.5 mm", "3.5mm"];

// Only labels that name real hardware. "default" and "phone" are not here: the
// first is the route-following pseudo-device, which IS the headset on a Bluetooth
// route, and the second is a substring of "microphone" and "headphones".
const BUILT_IN_MARKERS = [
  "built-in",
  "built in",
  "builtin",
  "internal",
  "speakerphone",
  "bottom microphone",
];

// These follow the OS route instead of naming a device, so pinning one with
// { exact } re-opens whatever the system already chose.
const ROUTE_FOLLOWING_IDS = new Set(["default", "communications"]);

export function isBluetoothLabel(label: string): boolean {
  const lower = label.toLowerCase();
  if (WIRED_MARKERS.some((marker) => lower.includes(marker))) return false;
  return BLUETOOTH_MARKERS.some((marker) => lower.includes(marker));
}

/**
 * The label of the device actually in use, so a merely paired headset sitting in
 * the inventory does not read as the current route. Chrome's "default" entry
 * carries the current default's name, which is the answer when nothing is picked.
 */
export function activeRouteLabel(
  devices: readonly AudioDeviceLike[],
  selectedId: string,
): string | null {
  const selected = selectedId ? devices.find((d) => d.deviceId === selectedId) : undefined;
  const fallback = devices.find((d) => ROUTE_FOLLOWING_IDS.has(d.deviceId)) ?? devices[0];
  return (selected ?? fallback)?.label ?? null;
}

export function isActiveRouteBluetooth(
  devices: readonly AudioDeviceLike[],
  selectedId: string,
): boolean {
  const label = activeRouteLabel(devices, selectedId);
  return label !== null && isBluetoothLabel(label);
}

export function findBuiltInInputId(inputs: readonly AudioDeviceLike[]): string | null {
  const match = inputs.find((device) => {
    if (ROUTE_FOLLOWING_IDS.has(device.deviceId)) return false;
    if (isBluetoothLabel(device.label)) return false;
    const lower = device.label.toLowerCase();
    return BUILT_IN_MARKERS.some((marker) => lower.includes(marker));
  });
  return match?.deviceId ?? null;
}

export function isAndroidDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android/i.test(navigator.userAgent);
}

// iPadOS 13+ Safari reports a Mac UA, so the touch count is the only tell
export function isIOSDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iphone|ipod|ipad/i.test(ua)) return true;
  return /macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
}

/**
 * True where the output picker has nothing to pick: no setSinkId at all, or iOS,
 * where it exists from 18.4 but exposes a single virtual system speaker.
 * Capability first, so a touchscreen laptop keeps a control that works there.
 */
export function isMobileAudioRoute(): boolean {
  if (typeof HTMLMediaElement !== "undefined" && !("setSinkId" in HTMLMediaElement.prototype)) {
    return true;
  }
  return isIOSDevice();
}
