# Synced YouTube Playback (replaces tab-audio sharing)

## Goal

Remove the Chromium-only `getDisplayMedia` tab-audio share entirely. The singer pastes a YouTube link; every client (singer and audience) plays the same video in its own YouTube IFrame player. The singer's client is the clock authority, so the singer keeps zero music latency. Only the voice travels over LiveKit, exactly as today. Works in any browser, desktop or mobile.

## Acceptance criteria

- Voice pipeline (mic capture, voice effect chain, LiveKit publish) behaves identically to today.
- Existing volume sliders keep their positions and meanings; music sliders now drive the local player volume.
- No user can interact with the YouTube surface directly. All control flows through app UI, then PartyKit, then players.
- Audience playback is delayed by an automatically estimated voice-arrival offset (WebRTC jitter buffer plus half RTT); a manual override lives in the settings drawer.
- Recording and auto-mix ducking are removed in this version.
- Ships as a PR; PartyKit protocol changes are additive so prod clients keep working during the deploy gap.

## Architecture

### Protocol (PartyKit)

`VideoState` (mirrored by hand into `party/types.ts` and `src/types/room.ts`, per the repo's type-sync rule):

```ts
{ videoId: string; title: string | null; playing: boolean; videoTime: number; wallTime: number; singerId: string }
```

- `RoomState` gains `video: VideoState | null`, populated in `buildRoomState()` so late joiners catch up.
- New client messages: `video-load {videoId, title?}`, `video-sync {playing, videoTime}`, `time-sync {t0}`.
- New server messages: `video-state {video, serverTime}` (point broadcast, not `broadcastState()`, since it fires every ~2s), `time-sync {t0, t1}` (reply to sender only).
- Authority: `video-load`/`video-sync` are rejected unless the sender is `currentSingerId`. `videoId` must match `/^[a-zA-Z0-9_-]{11}$/`; times must be finite.
- The server stamps `wallTime` with its own clock on receipt of `video-sync`, so singer clock skew never enters the system.
- `videoState` is cleared at every site that clears `currentSingerId` (finish-singing, leave-queue while singing, disconnect, 60s timeout, promoteNextSinger).
- The 60s singer idle timer is suspended while `videoState.playing` is true instead of `isSharingAudio`.

### Clock sync

Clients estimate `serverOffset` from `time-sync` round trips: ~4 probes on join, one every 30s, resample after reconnect. Offset is the median of min-RTT samples, kept in a ref.

### Playback sync (audience)

```
target = videoTime + (estimatedServerNow - wallTime) / 1000 - offsetSec
drift  = target - player.getCurrentTime()
```

- `|drift| < 0.05s`: rate 1.0.
- `0.05s <= |drift| < 1.5s`: `rate = clamp(1 + drift * k, 0.95, 1.05)`. If the embed rejects fractional rates (check `getAvailablePlaybackRates`), fall back to seek.
- `|drift| >= 1.5s` or joining mid-song: seek once, then resume nudging.
- One interval at ~300ms, all refs, no re-renders.

`offsetSec` is estimated automatically per listener (`useAutoSyncOffset`: fixed 80ms base for the unobservable singer-side leg, plus half the listener-to-SFU RTT, plus the receiver jitter-buffer hold, EMA-smoothed, sampled every 5s). A manual override slider (0 to 1500ms, persisted in localStorage) lives in the settings drawer.

### Player

`useYouTubePlayer` injects the IFrame API once (module-level singleton promise) and creates the player with `controls: 0, disablekb: 1, fs: 0, rel: 0, iv_load_policy: 3, playsinline: 1, modestbranding: 1, origin: window.location.origin`. `VideoStage` renders the player under a transparent overlay div with pointer events enabled (a plain `absolute inset-0` blocker) and `tabIndex={-1}`, so no clicks or keys reach the iframe. Embed errors 101/150 render an "embedding disabled, pick another video" state; the singer can paste a new link.

Autoplay: the player is created and primed (muted play then pause) on the existing AudioUnlockOverlay click, the one guaranteed gesture per client.

### Voice pipeline

The Web Audio graph (mic source, effect chain from `createEffectChain`, mic gain, `MediaStreamDestination`, LiveKit `publishTrack`) is kept intact; only the system-audio branch is removed. `startSharing` becomes `startSinging`: same lifecycle (auto-stop on turn end), same hot-swap paths for device change, NC toggle, and effect change, no `getDisplayMedia`. The published voice track moves from `Track.Source.ScreenShareAudio` to `Track.Source.Microphone`; the remote `lkType` music/mic split and the music element branch are removed, and AudioVisualizer retargets to the current singer's voice track.

### Sliders

- Listener controls collapse to two local sliders: Voice (singer voice element volume) and Music (local player volume). Nothing routes to the singer anymore.
- Singer "Music" mix slider: own local player volume. Singer "Voice" slider: published mic gain, unchanged.
- Toolbar mic volume and all per-person/voice sliders: unchanged.

### Queue

JoinQueueModal gains an optional YouTube URL field next to the song name. If provided, the client sends `video-load` on promotion, so the stage is ready the moment the turn starts.

## Removals

- `getDisplayMedia` capture, tab-title song sniffing, system gain branch, `sharingError` tab-share cases.
- `canSing` gate and every consumer (Chromium banner, PeoplePanel copy, StageBanner fallback). `detectBrowser`/`browserLabel` stay for display.
- Recording: Record button, RecordingModal, `startRecording`/`stopRecording`.
- Auto-mix: toggle UI, analyser/interval block, `autoMix` from `ParticipantStatus`.
- Dead files with zero imports: `useSystemAudio.ts`, `useWebRTC.ts`, `useMicrophone.ts`, `lib/webrtc.ts`, plus the now-dead `signal` protocol.
- Docs: README architecture diagram, CLAUDE.md single-track-mixing section and Chromium note, review rubric rewritten for the new critical paths (sync loop, voice pipeline).

## Deploy order

PartyKit deploys separately from Vercel. All protocol changes are additive, so: deploy the party server first, then test the Vercel preview against it. Old prod clients ignore the new `video` field and never send the new messages.

## Known risks

- Per-viewer YouTube ads desync the start; drift correction recovers once content plays.
- `setPlaybackRate` may snap to coarse steps on some embeds; the seek fallback covers it.
- Fresh joiners in background tabs may defer playback until focus (browser autoplay heuristics).
