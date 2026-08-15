---
applyTo: "**"
---

# KaraOK Code Review Instructions

## Project Context

Real-time karaoke room app. The singer's mic runs through a Web Audio effect chain and is published as one voice-only LiveKit track. Music never crosses LiveKit: every client plays the same YouTube video locally, kept in step through PartyKit. Next.js 15 frontend.

## Critical: Voice Pipeline

The singer's audio pipeline (`startSinging` → `AudioContext` → `publishTrack`) is the most latency-sensitive code. Any change to `startSinging`, `stopSinging`, `cleanupMix`, or the mix AudioContext requires extra scrutiny. `startSinging`/`stopSinging` are driven by the `isMyTurn` effect in `useLiveKit.ts`, not by a button.

## Critical: Video Sync Loop

`useVideoSync.ts` corrects drift against `videoTime + (estimatedServerNow - wallTime)/1000 - offsetSec`. When reviewing it, check:

- The loop stays on refs and a single `setInterval`. Anything that makes it call `setState` per tick re-renders the player and is a bug.
- `wallTime` is stamped by the PartyKit server on receipt, never by the singer's `Date.now()`. A client-stamped `wallTime` silently breaks every listener whose clock is off.
- Rate nudges stay inside `[0.95, 1.05]`, and support is judged a tick later, never by reading `getPlaybackRate()` right after setting it: the iframe reports the applied rate only after a round trip.
- When rate control is unavailable, sub-threshold drift is left alone. Seeking it away every tick rebuffers, which manufactures the next tick's drift.
- `usePartyClock` must not piggyback on the ping/pong heartbeat: the server evicts a connection after 40s without a pong.
- `videoState` is cleared everywhere `currentSingerId` is cleared, or the next singer inherits the previous video.
- `video-state` is a point `broadcast(...)`, not `broadcastState()`: it fires every ~2s and `broadcastState()` also triggers registry reporting.
- Only `currentSingerId` may send `video-load`/`video-sync`, and `videoId` is validated against `/^[a-zA-Z0-9_-]{11}$/` on the server.
- The `VideoStage` overlay must have pointer events enabled and stack above the iframe, and the player container stays `inert` so the frame is out of the tab order. `pointer-events: none` inverts the requirement and lets clicks through to YouTube.

## Type Synchronization

`party/types.ts` and `src/types/room.ts` must stay in sync manually. Every message type, field, or `RoomState` change must be updated in both files. Flag any PR that modifies one without the other.

## Key Patterns

- **Refs over state** for values used in callbacks/timeouts to avoid stale closures (`isMicEnabledRef`, `talkingNCRef`, `singingNCRef`, `voiceEffectRef`). When reviewing, check that new callbacks don't capture stale React state.
- **`useCallback` with `[]` deps + ref reads inside** is the standard pattern for stable callbacks that need current values. Don't flag missing deps when refs are used intentionally.
- **`eslint-disable-next-line react-hooks/exhaustive-deps`** comments are intentional — the deps are managed via refs. Don't flag these.
- **Web Audio `connect()` is fan-out** — connecting a node to multiple destinations is valid and expected (e.g., mic source → effect chain + analyser).

## What to Check

1. **Protocol consistency**: New message types in both type files + handled in server switch + handled in client `onMessage`.
2. **Gain node lifecycle**: Any code that sets `gain.value` must consider auto-mix (`setTargetAtTime` ramps). Direct `gain.value = x` cancels ramps — this is correct behavior.
3. **MediaStream cleanup**: Every `getUserMedia` call must have a corresponding `track.stop()` in all code paths (success, error, unmount).
4. **AudioContext cleanup**: Every `new AudioContext()` must have `ctx.close()` in cleanup.
5. **`Number.isFinite` validation**: Any numeric values from PartyKit messages must be validated before use in Web Audio (NaN poisons `AudioParam`).
6. **Mute-all state**: `mutedBySinger` is server-persisted in `RoomState`. Check that it's cleared on singer change and survives reconnects.
7. **Late joiners**: anything added to `RoomState` must also be defaulted in `useRoomState.ts`'s room-state block, because PartyKit deploys separately from Vercel.
8. **Protocol compatibility**: PartyKit deploys before Vercel, so server messages keep every field old clients still read (`mix-adjust` ships `music` for pre-YouTube clients).

## What NOT to Flag

- Vercel preview deployment failures (env vars not set for preview — known infra issue)
- `setSinkId` on `AudioContext` — experimental API, guarded by `"setSinkId" in ctx`
- Publishing the effect-chain output as `Track.Source.Microphone` while LiveKit's managed mic is disabled - intentional, it avoids double voice
- `data-lk-identity` DOM attributes on audio elements — intentional for per-person volume matching
- The YouTube IFrame API loading from a third-party origin - there is no first-party alternative for synced playback

## Style

- Lucide icons for all UI elements (no emoji in UI, emoji only in chat/reactions)
- CSS variables for all colors (`var(--color-primary)`, etc.) - no hardcoded hex colors
- TypeScript strict mode with `noUncheckedIndexedAccess`
- Path alias `~/` maps to `src/`
- Named exports only (`export function X`) - no default exports
- PascalCase for components, camelCase for hooks/utils
- No em dashes in any text (comments, commits, strings)
- Fonts referenced via CSS vars (`var(--font-display)`, `var(--font-body)`)

## Component Patterns

- Props interface defined above the component function, named `ComponentNameProps`
- Modals: backdrop (fixed inset-0) + centered card (fixed left-1/2 top-1/2) + Escape key handler + click-outside dismiss
- Error state in hooks: `error: string | null`, displayed as conditional banner
- `useCallback` with `[]` deps + ref reads inside is intentional - don't flag missing deps when refs are used
- `eslint-disable-next-line react-hooks/exhaustive-deps` comments are intentional - deps managed via refs

## Cleanup Requirements

- Every `new AudioContext()` must have `ctx.close()` in all cleanup paths
- Every `getUserMedia()` must have `track.stop()` in all cleanup paths
- Every `setInterval`/`setTimeout` must be cleared on component unmount
- `mutedBySinger` and `videoState` must reset when the room empties
