# Audio architecture: one core, thin drivers

Status: living document. Written 2026-08-17 against the current `src/` tree, for Elvis and any future contributor touching audio.

Companion reading: `docs/plans/2026-08-16-cross-platform-playbook.md` (platform verdict and ports table), `docs/plans/2026-08-17-bluetooth-hfp-research.md` (why capture eventually leaves the WebView).

---

## 1. The principle

**One core, thin drivers. The port interface gets extracted when the second driver exists, never before.**

Audio is the sole priority for the coming weeks, and the likely end state is a shared audio core with a web driver, an iOS driver and an Android driver under it (per the HFP research, section 3 item 5: capture moves into the native LiveKit SDKs, because that is the only real fix for the Bluetooth quality collapse). That end state is a reason to shape the code, not a reason to build the abstraction now.

Three rules follow.

**Rule 1: decisions go in the core, mechanisms go in the driver.** A decision is anything a human argued about: a threshold, a preset constant, a retry ladder, a state transition, an error message, a priority order. A mechanism is the API call that carries the decision out: `getUserMedia`, `createBiquadFilter`, `setSinkId`, `room.connect`. Decisions are pure TypeScript in `src/lib/`, testable with vitest and readable by a Swift engineer as a spec. Mechanisms live in hooks and adapters and are expected to be thrown away per platform.

**Rule 2: no speculative interfaces.** We do not write `interface AudioDriver` today. An interface designed against one implementation encodes that implementation's accidents; the web's `MediaStream`, `AudioNode` and `RTCStatsReport` would all leak into it and the iOS driver would then have to fake them. The right moment to extract the port is when the first native driver is being written and can argue back. Section 3 of this document is the sketch we will argue against, explicitly marked DRAFT and explicitly not code.

**Rule 3: prepare the seam by narrowing, not by wrapping.** Between now and then, the productive work is the opposite of adding layers: delete vendor types from return values, collapse duplicated rules into one named function, move constants out of adapters. Every one of those pays off on web this month (fewer places to get wrong, more things under test) and shrinks the eventual port surface for free. `src/lib/voiceMixer.ts` is the model: it is 100% Web Audio, and it is fine, because every gain decision it used to own now lives in `src/lib/volumeModel.ts` behind tests.

The concrete target: **a native driver should be a swap of a handful of files, not a rewrite of the audio hooks.** We measure progress by how much of the audible behavior is decided in `src/lib/` rather than by how many interfaces exist.

---

## 2. Layer map

Layers:

- **pure-core**: no React, no DOM, no vendor SDK. Ships to native verbatim or reads as a rewrite spec.
- **policy**: the decisions are platform-free but currently expressed over web types or inside React plumbing.
- **web-io**: mechanism. Expected to be replaced per platform.
- **mixed**: contains both, and the row says which part is which.

| File | Layer | Stays shared (core) | Each platform reimplements |
|---|---|---|---|
| `src/lib/syncMath.ts` | pure-core | Everything: drift thresholds, `computeTarget`, `computeSyncAction`, clock-offset estimator, voice-latency estimator. Tested. | Nothing. Runs unchanged on any JS runtime; doubles as a Swift/Kotlin spec because every threshold is a named export. |
| `src/lib/volumeModel.ts` | pure-core | `personMixKey`, `clampGain`, stored-blob parse/serialize with the legacy migration, the identity LRU, `resolveGains`. Tested. | Nothing, once the `MASTER_MAX`/`PERSON_MAX` import from `voiceMixer.ts` is inverted (see debt D5). A driver supplies the same inputs and consumes the same three numbers. |
| `src/lib/audioRoutes.ts` | pure-core | `isBluetoothLabel`, `hasBluetoothRoute`, `findBuiltInInputId` as predicates over `AudioDeviceLike[]`. Tested. | Only the device list that feeds them. On iOS that is `AVAudioSession.availableInputs`, on Android `AudioDeviceInfo`. `isAndroidDevice`/`isMobileAudioRoute` are UA sniffs and become a build-time constant natively. |
| `src/lib/audioSession.ts` | mixed | The owner-set rule: capture owners are keyed rather than counted, and `playback` may only be set once every owner has released (setting it while capture is live pins a category that cannot record). | The `navigator.audioSession.type` write. iOS: `AVAudioSession` `playAndRecord`, mode `.default`, options `[.allowBluetoothA2DP, .defaultToSpeaker]` with `.allowBluetooth` deliberately omitted and `isAutomaticConfigurationEnabled = false`. Android: LiveKit `MediaAudioType`. |
| `src/lib/voiceEffects.ts` | mixed | The `VoiceEffect` union, the `VOICE_EFFECTS` catalogue the UI renders, every tuning constant (hall's four taps and 0.7 feedback, echo's 200ms/0.35, the warm shelves and compressor quad, bright's three bands, chorus's two LFOs) and the two non-linear wet/dry curves. | The six `create*` builders and `createEffectChain`. The `EffectChain` type is web-shaped (`input`/`output` are `AudioNode`) and stays that way. Native rebuilds the same graph from the same numbers on AVAudioEngine or Oboe. |
| `src/lib/voiceMixer.ts` | web-io | Nothing left, by design. It is an adapter behind a named interface and that is the correct shape. | All of it: the `source -> personGain -> masterBus -> duck -> limiter -> output` graph, the three-way sink strategy, the `<audio>` element fallback and its iOS `muted` invariant. This is the hardest port in the batch: native LiveKit SDKs do not hand back a per-track `MediaStream`, so per-person gain has to come from SDK volume hooks or a native engine. |
| `src/lib/prefs.ts` | web-io | The key names. | `localStorage` becomes `UserDefaults` / `SharedPreferences`. |
| `src/hooks/useLiveKit.ts` | policy | The composition facade and the effect ordering invariant (connection, input switch, mic-mode switch, NC republish, singing NC hot-swap, output switch, mic check, capture). Its return type minus three fields is the port in embryo. | Nothing structurally. The three fields that do not port are `room: Room`, `mixer: VoiceMixer` and `mixMicStream`, which is read inside the hook by the watchdog and the mic check and needs a platform-free replacement signal rather than a deletion (see D3). |
| `src/hooks/livekit/context.ts` | mixed | `UseLiveKitParams` (already a platform-free seven-value input contract), the `MicCheckState` union, and the two unnamed stored-preference parsers in the `useState` initializers. | The whole `LiveKitCtx` ref bag. It is the adapter's private scratch space, full of `Room`, `AudioContext`, `GainNode` and `HTMLAudioElement`, and a native driver replaces it wholesale rather than porting it. |
| `src/hooks/livekit/connection.ts` | mixed | The capture-profile rule (NC choice, channel count, sample rate, preset, DTX), the connect retry ladder over `(attempt, reason)`, the republish guards and their deliberate asymmetry, and the `CLIENT_INITIATED` disconnect suppression. | `Room` construction and event wiring, `room.connect`, the hidden `<audio>` element farm with `setSinkId`, the autoplay-unlock listener set, `switchActiveDevice`, `room.options.audioCaptureDefaults`. The element farm and the unlock listeners do not port, they disappear. |
| `src/hooks/livekit/capture.ts` | mixed | The mic-intent coalescing machine (in-flight guard plus a single pending slot), the mic error classification, `stopSinging`'s ordering rule against a live mic check, the `startSinging` failure rollback order, the stage-turn effect, the wet/dry clamp. | `getUserMedia`, the `AudioContext` graph, `publishTrack`/`unpublishTrack`, the chain rebuild, gain writes. Critical path per CLAUDE.md: extract alongside, never restructure. |
| `src/hooks/livekit/micCheck.ts` | mixed | The generation-token cancellation protocol, the room-isolation rules (zeroing the published mix gain is the isolation, so a managed mic must stay muted while `mixOwnsMic`), the toggle/transition semantics, and the two constants (15s gUM timeout, 2s error reset). | The second `AudioContext`, the loopback wiring, the abort closures, the `setSinkId` cast. Two web-only failure modes vanish natively: the suspended-context "blocked by the browser" message and the `visibilitychange` auto-stop. |
| `src/hooks/useAudioDevices.ts` | web-io | `MicMode` (`voice` = NC on, `raw` = NC off) is a plain policy enum with no web dependency, and the rule that a remembered `deviceId` is only restored when it is still enumerated (a stale exact constraint makes `getUserMedia` throw). | Everything else: the permission-priming `getUserMedia`, `enumerateDevices`, the label fallbacks, the `devicechange` subscription. This file gets rewritten, not ported. |
| `src/hooks/useVolumeMix.ts` | mixed | Already delegated: every gain decision is `resolveGains`/`trackIdentities`/`clampGain`. The hook holds React state and clamped setters. | The two inline `localStorage` functions and the three push effects into `VoiceMixer` and the player handle. This is the junction of the two biggest audio ports and therefore the most valuable single seam in the tree. |
| `src/hooks/useAudioLevel.ts` | policy | `POLL_MS` 75, `SMOOTHING` 0.45, the 0..1 clamp, the reset-on-null rule. Polling by design so meters redraw at a fixed rate regardless of transport. | Nothing but the `window.` prefix on the timer. What a driver must supply is the source, a `() => number`, not this file. |
| `src/hooks/useSingerAudio.ts` | mixed | The voice-track priority order (named `karaoke-voice` publication, then first subscribed unmuted audio, then local participant when the singer is you) and the identity match (exact `lkIdentity`, else display name as prefix). | The `livekit-client` import and, more importantly, the return types: `MediaStreamTrack` and `RTCStatsReport` are browser types with no native analogue. |
| `src/hooks/useAutoSyncOffset.ts` | mixed | The 5s cadence, the reset of the EMA on every singer or activity change (each singer is a different network path), and the first-sample rule: no jitter delta means commit nothing, because seeding the EMA with a known-too-low estimate makes the loop chase it. | The `RTCStatsReport` walk. Both native SDKs expose receiver stats but not as an `RTCStatsReport` iterable. |
| `src/hooks/useVideoSync.ts` | mixed | The load signature (`videoId:loadedAt`), the start-seconds computation, the singer's 2s cadence and the stalled rule, the seek cooldown with the rate reset, the rate-support handshake, the playback-blocked heuristic. Drift decisions already live in `syncMath`. | Nothing directly, it only touches `YouTubePlayerHandle`. But the inlined YouTube state numbers (-1/1/2/3/5) are a vendor enum wearing no name. |
| `src/hooks/useYouTubePlayer.ts` | web-io | The `YouTubePlayerHandle` interface itself, which is the port, plus two behavioral rules: the player must be created inside a live user gesture, and the pending load/volume queue replays work issued before `onReady`. Every getter returns a promise (2026-08-17), so a player behind a bridge can answer at all; the web adapter resolves each one on the spot, and commands stay fire and forget. `getTime()` answers `{ seconds, readAt }` rather than a bare number, because only the player's own side of the bridge knows when the position was sampled and a caller that times the read instead would bias the drift by the round trip. | Everything else, and there is no native YouTube player, so a native shell carries the same IFrame API inside a WebView with a self-hosted proxy page and `allowsInlineMediaPlayback` at the config layer. |
| `src/components/room/RoomView.tsx` | composition | The narrow-props rule: no component below it takes a `Room`. It turns the transport into `getMicLevel`, `getSingerLevel`, `getSingerTrack` and a stats provider. | Nothing. This file is why the UI is already portable, and it is the reason the `room` leak in `useLiveKit` is worth closing (see debt D1). |

---

## 3. DRAFT port sketch

**This is DRAFT and is not code.** Nothing in `src/` should import it. It exists so that when the first native driver is written we argue against a written proposal instead of inventing one under deadline, and so that today's narrowing work has a target to aim at. Expect the iOS driver to change at least three of these operations; that is the point of waiting.

Shapes referenced below are platform-free by construction:

```
CaptureProfile  { nc, channels: 1 | 2, sampleRateHz: 48000 | null,
                  preset: "voice" | "musicStereo" | "musicHQ", dtx }
AudioRoute      "bluetooth" | "wired" | "builtin" | "speaker" | "unknown"
LatencySample   { rttMs, jitterBufferDelayS, jitterBufferEmittedCount }
```

| # | Operation | Why it is in the port | Web today | Native |
|---|---|---|---|---|
| 1 | `connect(url, token) / disconnect()` | Session lifecycle. The multi-key failover ladder stays above the driver as pure policy; the driver only reports which failure it hit. | `Room` + `room.connect` in `connection.ts` | `client-sdk-swift` / `client-sdk-android` |
| 2 | `configureSession(intent: "listening" \| "capturing")` | The one thing the web genuinely cannot do and the whole HFP fix hangs on it. Already has a web home in `audioSession.ts`. | `navigator.audioSession.type` | `AVAudioSession` category and options; `MediaAudioType` |
| 3 | `setManagedMicEnabled(enabled, profile)` | Talking mic on and off. Takes a `CaptureProfile` rather than platform constraints. | `setMicrophoneEnabled` + track constraints | SDK managed mic |
| 4 | `startSingerCapture(profile, effect, wetDry) / stopSingerCapture()` | Publishes exactly one track named `karaoke-voice` at a music-quality preset with DTX and RED off. | `startSinging` / `stopSinging` | Native capture into the SDK publish path |
| 5 | `updateCaptureProfile(profile)` | The NC hot-swap: re-capture with new constraints without dropping the published track. Separate from 4 because dropping the track is audible. | `useSingingNCHotSwap` | Re-open input, keep the publication |
| 6 | `setEffect(effect) / setEffectWetDry(wet)` | Effects hooks, swappable while live. Both platforms expose a capture post-processor for exactly this. | `createEffectChain` rebuild | `capturePostProcessingDelegate` / `AudioProcessorOptions` |
| 7 | `setCaptureGain(value)` | The publish-bus gain. Also how a mute that keeps the capture open is expressed, which matters because stopping capture flips the audio session. | `setMixMicGain` | Engine gain node |
| 8 | `startMonitor(profile) / stopMonitor()` | Mic check: capture through the same effect chain to the selected output, while every remote voice is ducked and the published path is silenced. | `micCheck.ts` second `AudioContext` | `AVAudioEngine` input to output under an already-`playAndRecord` session |
| 9 | `listDevices() / selectInput(id) / selectOutput(id)` | Device selection. The output half legitimately degrades to a route choice on mobile. | `enumerateDevices`, `switchActiveDevice`, `setSinkId` | `availableInputs` + `setPreferredInput`; output picker hidden |
| 10 | `getRoute(): AudioRoute` and `onRouteChange(cb): () => void` | Route info and events. Feeds the Bluetooth warning and the built-in-mic preference, both of which are already pure in `audioRoutes.ts`. | `devicechange` + label predicates | Route-change notification, no label guessing needed |
| 11 | `setPersonGains(Record<identity, number>) / setMaster(v) / setDuck(v)` | Per-track playback gain. The decisions are already `resolveGains`; the driver only applies three numbers. Hardest to implement natively, cheapest to specify. | `voiceMixer.ts` | SDK per-participant volume plus a bus duck and limiter |
| 12 | `getMicLevel() / getPeerLevel() / getSingerLevel(identity)` | Level metering, pulled at the existing 75ms tick. Scalars, not streams, because no native SDK will hand back a `MediaStream` for an analyser. | `participant.audioLevel`, analyser over the mix | SDK audio-level callback or an engine tap |
| 13 | `getSingerStats(): Promise<LatencySample \| null>` | Auto sync offset. Narrowing this to three fields is the difference between swapping one adapter and rewriting `useAutoSyncOffset`. | `RTCStatsReport` walk | SDK receiver stats |
| 14 | `onEvent(cb)` for `{ connectionState, activeSpeakers, trackSubscribed, trackUnsubscribed, error }` | The event surface the room UI actually consumes. Remote track events carry an identity and a handle the driver's own mixer understands, never a `MediaStream`. | `RoomEvent` handlers | SDK delegates |
| 15 | `localIdentity: string \| null` | Consumed for `lkIdentity` and for the gain map keys. Must be the same identity string PartyKit carries, or `trackIdentities`' name-fallback silently becomes the only path. | `localParticipant.identity` | Same |

Deliberately **not** in the port: anything returning `MediaStream`, `MediaStreamTrack`, `AudioNode`, `RTCStatsReport` or a `Room`; the hidden `<audio>` element handling; the autoplay unlock; `syncElements`. Those are web mechanisms with no counterpart, and a port that mentions them is a port designed backwards.

---

## 4. Seam debts

Every item is a real duplication or a real leak that costs something on web today. Effort is one engineer, including tests where the change is extraction of a decision.

### Do now, before any driver work

| ID | Debt | Where | Fix | Effort |
|---|---|---|---|---|
| D1 | `room: Room` escapes `useLiveKit` to callers, the one remaining vendor type in the return. `RoomView` uses it for four small things. | `useLiveKit.ts`, `RoomView.tsx` | Return `getMicLevel()`, `getPeerLevel()`, `localIdentity` instead. Removes `livekit-client` from the return type and finishes CLAUDE.md's own narrow-props rule. | Half a day |
| D2 | **Paid, 2026-08-17.** The capture-profile decision (NC choice, channels, sample rate, preset, DTX) was written out **nine times** across `connection.ts`, `capture.ts` and `micCheck.ts`. | `src/lib/audioProfile.ts` | `resolveCaptureProfile({ micMode, talkingNC, singingNC, purpose })` returns the platform-free shape and `toMediaTrackConstraints(profile, deviceId)` is the web translation. Every call site now names a purpose; `toAudioPreset` in `capture.ts` is the one other translation. | Done |
| D3 | ~~`mixMicStream` is dead~~ **Withdrawn, 2026-08-17: it is live.** `RoomView` still never destructures it, but the mic watchdog and the shared-capture mic check both take it as a prop and both use it as an effect dep, so the six setter call sites are what tells them a capture was replaced or died. The field stays; the port surface owes a replacement signal (a capture generation, not a `MediaStream`) whenever the first driver is written. | `context.ts`, `capture.ts`, `connection.ts`, `useLiveKit.ts`, `micWatch.ts`, `micCheck.ts` | Nothing to do. | - |
| D4 | `volumeModel.ts` imports `MASTER_MAX`/`PERSON_MAX` as values from `voiceMixer.ts`, so the pure model has a downward edge into the Web Audio adapter. | `volumeModel.ts`, `voiceMixer.ts` | Move the two constants down and import them back up. `volumeModel.ts` becomes import-free. | 10 minutes |
| D5 | `useAutoSyncOffset` imports `SYNC_OFFSET_DEFAULT_MS` from a component file, so a hook depends on the UI layer. | `SyncOffsetControl.tsx`, `syncMath.ts` | Move the constant next to `LATENCY_MIN_MS`. | 10 minutes |
| D6 | The `RTCStatsReport` walk lives inline in an effect, untestable. | `useAutoSyncOffset.ts` | `readLatencySample(fields): LatencySample & { hasJitterDelta }` as a pure function over an iterable, tested with plain fixture objects. Isolates the exact code a native driver rewrites. | 2 hours |
| D7 | The singer voice-track priority order and the identity prefix match are two subtle rules with no tests. | `useSingerAudio.ts` | Lift `pickVoiceTrack(publications, singerIdentity)` and `matchesSingerIdentity(a, b)` into a lib module over `{ identity, trackName, kind, isSubscribed, isMuted }` records. | 2 hours |
| D8 | **Paid, 2026-08-17.** Mic error copy and its 3s auto-clear were duplicated between `applyMicState`'s catch and `startSinging`'s catch. | `src/lib/micErrors.ts` | `classifyMicError(err, policy)` owns the classification and the auto-clear rule; `MIC_TOGGLE_ERRORS` and `START_SINGING_ERRORS` are the two copy tables, which were never the same wording and are not now either. | Done |
| D9 | The connect retry ladder is a pure state machine buried in a closure. | `connection.ts` | `nextConnectAttempt(attempt, reason): { retry, delayMs, useNextKey }`, tested. Multi-key failover is the thing we least want to debug live. | 2 hours |

### Worth doing, slightly lower urgency

| ID | Debt | Fix | Effort |
|---|---|---|---|
| D10 | Effect tuning constants and the two non-linear wet/dry curves are scattered through six builder functions. | Hoist an `EFFECT_PRESETS` record plus per-effect `wetDryCurve(w)` and leave every `ctx.createX` where it is. Makes the numbers reviewable and gives a native chain a table to read. | Half a day |
| D11 | `useVolumeMix` talks to `localStorage` inline while `src/lib/prefs.ts` already exists. | Route both through `prefs.ts`. The hook body then contains no web API at all. | 1 hour |
| D12 | YouTube's state integers (-1/1/2/3/5) are inlined in `useVideoSync`, a file that otherwise knows nothing about YouTube, and `YouTubePlayerHandle` is declared inside its only implementation. | Move the handle and a named `PlayerState` enum into their own type module. Then `useYouTubePlayer` is a swappable leaf and the handle is visibly frozen. | 1 hour |
| D13 | `computeStartSeconds` (the mid-song-join correctness path, including the unsynced-clock and non-singer-offset cases) is inline in an effect. | Move into `syncMath.ts` and test it. | 1 hour |
| D14 | The mic-check state transitions are only verifiable by hand in a live room. | `micCheckTransition(state, action): MicCheckState`, pure and tested. Leave the `AudioContext` code and the abort closures untouched. | 2 hours |

### Wait

| ID | Item | Why wait |
|---|---|---|
| D15 | The mic-intent reducer in `capture.ts` (in-flight guard plus single pending slot) and `micCheckIsolationPlan`. | Both are real policy worth naming, but `capture.ts` is the critical path and is being edited by a concurrent batch. Extract after that lands, not alongside it. |
| D16 | Neutralizing `LiveKitCtx`. | It is the adapter's private scratch space. Making it platform-shaped buys nothing and costs review surface on the most sensitive file we own. |
| D17 | Making `EffectChain` a neutral port. | It is the one type both the singing mix and the mic-check loopback pass around by reference. Web-shaped is correct until a second implementation exists. |
| D18 | Writing `interface AudioDriver` from section 3. | By decision. Section 3 is the argument, not the artifact. |
| D19 | Collapsing `useVolumeMix`'s three push effects behind one sink object. | Small and tempting, but it is the shape most likely to be wrong before a native mixer tells us what it wants. |

### Recommendation

Do **D1 through D9** before any driver work. Together they are roughly two and a half days, every one of them removes a duplication or a vendor leak that costs us on web today, and collectively they take the eventual port surface from "rewrite the hooks" to "swap the adapters". D2 alone (nine copies of one rule) was the highest-value item in the list. D2 and D8 are paid, D3 is withdrawn, and D1, D4 through D7 and D9 are still open.

Do **D10 through D14** in the following week, opportunistically, whenever the file is open for other reasons.

Do not do **D15 through D19** yet. D15 is blocked on the concurrent `capture.ts` work; the rest are blocked on the first native driver, which is the whole premise of this document.

Two debts previously on this list are already paid, and they are the pattern to copy: `src/lib/audioRoutes.ts` (Bluetooth route detection and the built-in-input preference, HFP items 1 and 2) and `src/lib/audioSession.ts` (the owner-keyed session-type rule, HFP item 3). Both are a pure, tested top half plus a thin web-only bottom half, in one file, with no interface anywhere. That is exactly the seam shape this document is asking for.

---

## 5. The propagation rule

**A behavior change is made once, in the core. Drivers translate, they never decide. Anything decided in two places is a bug, even when both copies currently agree.**

How a change flows, in order:

1. **Name the decision.** If the change is audible or user-visible, it is a decision: a threshold, a constant, a transition, a priority order, an error string, a retry ladder.
2. **Find its single home in `src/lib/`.** If it does not have one, that is the change. Create the pure function or constant first, in its own commit, with the behavior held identical.
3. **Change it there, and change the test next to it.** The test lives with the decision, never with the driver. A test that needs an `AudioContext` to assert a threshold is testing the wrong layer.
4. **Let the drivers pick it up.** A driver's job is translation: `CaptureProfile` to `MediaTrackConstraints` on web, to `AVAudioSession` settings on iOS. If a driver needs a `switch` on the new value, the decision is still half in the driver and step 2 is not finished.
5. **Confirm the count.** Grep for the old literal. If more than one call site changes, the decision had copies, and collapsing them is part of this change, not a follow-up.

Corollaries, in the form that is easy to check in review:

- **A driver contains no platform conditional.** The platform difference is which driver is loaded, not an `if` inside one. `isAndroidDevice()` in `audioRoutes.ts` is the standing exception and is a UA sniff for the web driver only; it must never grow a third branch.
- **Every number a user can hear is a named export.** Delay taps, feedback amounts, wet/dry curves, poll intervals, smoothing factors, timeouts, retry delays. A magic number inside a `create*` function is a decision hiding in a mechanism.
- **A rule written twice is a rule that will diverge.** The capture profile was written nine times (debt D2) and it is the concrete reason this section exists: the day singing NC changes shape, eight of the nine would have been updated and one would not, and the symptom would be one code path publishing mono. It is one function now, and the nine call sites name a purpose instead of a constraint set.
- **Ports shrink, they do not grow.** Every method added to `YouTubePlayerHandle` or to a future driver interface is a method three platforms owe. Adding one is a design decision that belongs in the PR body.
- **When behavior and a driver disagree, the driver is wrong.** The core is the specification. If iOS cannot do what the core decided, the core changes to something all three platforms can express, and the change is argued once, in one file.
