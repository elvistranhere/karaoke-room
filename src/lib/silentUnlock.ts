/**
 * The pre-audioSession half of the ringer-switch fix.
 *
 * WebKit routes a Web Audio graph under the ringer switch unless the page declares a
 * media session, so on iOS the room's music keeps playing while every voice goes silent.
 * `navigator.audioSession` says so directly, but it only exists from 16.4 and is
 * quirk-disabled in some WKWebView shells. Where it is missing, a silent `<audio>`
 * element looping in the same page is the only lever left: WebKit treats the page as
 * media playback for as long as one is playing, which the ringer switch does not silence.
 *
 * One element for the life of the document, started inside the audio-unlock gesture:
 * iOS refuses `play()` without a user activation, and a refused element never retries.
 */

import { isIOSDevice } from "./audioRoutes";

const SAMPLE_RATE = 8000;
const SECONDS = 1;

let element: HTMLAudioElement | null = null;
let objectUrl: string | null = null;

/** Only the builds the audio session API cannot cover, and only where the quirk is real. */
export function needsSilentUnlock(): boolean {
  if (typeof navigator === "undefined") return false;
  return !("audioSession" in navigator) && isIOSDevice();
}

// 8-bit mono PCM: silence is 128, not 0, and the 44-byte canonical header is shorter
// written than the base64 blob of the same file would be.
function silentWavUrl(): string {
  const frames = SAMPLE_RATE * SECONDS;
  const buffer = new ArrayBuffer(44 + frames);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + frames, true);
  ascii(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  ascii(36, "data");
  view.setUint32(40, frames, true);
  new Uint8Array(buffer, 44).fill(128);
  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}

export function startSilentUnlock(): void {
  if (element || typeof document === "undefined" || !needsSilentUnlock()) return;
  objectUrl = silentWavUrl();
  const el = document.createElement("audio");
  el.src = objectUrl;
  el.loop = true;
  el.preload = "auto";
  el.setAttribute("playsinline", "");
  el.style.display = "none";
  document.body.appendChild(el);
  element = el;
  void el.play().catch(() => {
    // Refused despite the gesture: the room is no worse off than before the element
  });
}

/**
 * iOS surfaces a playing <audio> element in the lock screen transport, so a hardware
 * pause, a call or the Control Center stops it and the ringer-switch protection lapses
 * for the rest of the session. The room's recovery gesture replays it with everything else.
 */
export function resumeSilentUnlock(): void {
  if (!element?.paused) return;
  void element.play().catch(() => {});
}

export function stopSilentUnlock(): void {
  element?.pause();
  element?.remove();
  element = null;
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
}
