# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## How We Work

The common practice for every change, shaped by how this repo is actually operated:

- **Who ships how.** Main is protected: 1 approval, Vercel CI, conversations resolved. Elvis (owner) bypasses and ships to main directly, and sessions working under his direct instruction do the same; that privilege is his, not a convention. Everyone else works on a feature branch and opens a PR through the review gauntlet (`gh pr create`, address bot and human review, merge when clean). Either path pays the same discipline: the gates below run before a push or a merge, never after.
- **Prod deploys from main automatically** (see Deployment), so whatever lands on main is live minutes later. Treat a merge like a release.
- **Gates before every push**, no exceptions: `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run e2e` when anything the suite touches changed (room flow, audio, sync, protocol, endpoints). `npm run build` when routing, config, or the service worker changed. A push with a known-red gate is never acceptable; a typecheck error that reaches main gets fixed in the next commit within minutes, not batched.
- **Commit style**: exactly one line, no `Co-Authored-By`, no em dashes. The commit says what changed; the reasoning lives in this file, the docs, or the code's own invariants.
- **Stage surgically.** Multiple agents or workstreams often have uncommitted work in this tree at once. `git add <specific files>` for your change; `git add -A` only when you have verified every modified file is yours. Sweeping another stream's half-finished work into your commit has broken main before.
- **Substantive changes run the pipeline**: implement, then two adversarial reviewers with different lenses (see Review Pattern), then a fix pass, then the orchestrator runs the gates independently before committing. The reviewers exist to find real breakage and they regularly do; "the implementer said it works" is not a gate.
- **Verify on prod, not in theory.** After a user-visible change deploys, join a fresh room on prod with a throwaway Playwright script (repo devDependency; launch Chromium with the fake-media flags from `playwright.config.ts`) and look at the result. Never test in a room a human is using; make a new room code.
- **Bug reports from a phone or a long-lived tab may predate the latest deploy.** The service worker serves the cached shell until a refresh, so before diagnosing "still broken", check whether the report shows the current build (hard refresh, or kill the installed PWA from the app switcher).
- **When a claim can be measured, measure it.** Pixel-diff screenshots with paint layers toggled to attribute a rendering artifact; read the wire or a Playwright trace to attribute a race; list LiveKit rooms server-side to check for leaks. The console is not on the YouTube iframe's side: use DevTools' frame selector to see inside it manually, but never build logic on it.
- **Never override an explicit user choice.** This is both a product rule (see Product Principles) and a code-review lens: recovery paths, auto-switches and defaults must all yield to a real human decision (an explicit device pick, an explicit mute).

## Product Principles

- **Discord is the reference product.** One consistent experience across web, desktop and mobile; per-user local audio control; floating menus over inline expansion; status glyphs on the roster. When designing anything cross-platform or audio, check how Discord does it first.
- **Listening is local, per user.** No participant may change another participant's audio state, ever. The wire carries no message that mutes, unmutes or sets the gain of anyone else. The singer controls shared playback only; the admin allowlist is kick, transfer admin, skip singer, remove from queue, room settings. Anything outside that allowlist that affects another user is a bug.
- **One volume per person, no role states.** A person has `{volume, muted}` applied identically whether they talk or sing.
- **Decided once, propagated everywhere.** A behavior decision (capture profile, gain math, sync policy, error copy) lives in exactly one pure module with tests; platform code only translates it. Anything decided twice is a bug. See `docs/design/AUDIO-ARCHITECTURE.md` for the layer map.
- **Audio experience is the priority.** UI is in a good state; the lasting differentiator is that the room sounds right on every platform. `docs/qa/AUDIO-QUIRKS-AUDIT.md` tracks the known platform quirks and their fix status; `docs/qa/AUDIO-TEST-MATRIX.md` is the release test sheet (run the 10-minute smoke subset before meaningful releases).
- **Privacy is enforced, not promised.** The analytics taxonomy in `docs/design/ANALYTICS.md` names everything sent; names, chat content, video ids/titles, room codes and stacks never leave the device, and tests plus a sanitizer hold that line.

## Commands

```bash
npm run dev:all          # Next.js (3000) + PartyKit (1999) - use this for local dev
npm run dev              # Next.js only
npm run dev:party        # PartyKit only
npm run lint             # biome lint . (linter only, formatter disabled)
npm run typecheck        # tsc --noEmit
npm run test             # vitest run (pure-function tests under src/ and party/)
npm run e2e              # playwright test (two-client browser suite under e2e/)
npm run build            # Production build
npm run deploy:party     # Deploy PartyKit server to Cloudflare
```

Vitest covers the pure models only (`src/lib/syncMath.ts`, `src/lib/volumeModel.ts`, `src/lib/audioProfile.ts`, `src/lib/audioRoutes.ts`, `src/lib/micErrors.ts`, `src/shared/protocol.ts`, the logging gate and analytics privacy helpers in `src/lib/logger.ts` and `src/lib/analytics.ts`, plus the security-relevant pure functions in `party/http.ts` and `src/lib/apiBase.ts`); there is no component test layer. On this machine the default e2e ports may be taken by stray servers: `E2E_NEXT_PORT=3200 E2E_PARTY_PORT=1997 npm run e2e` is the reliable invocation.

## Playwright E2E

`e2e/` drives real browser contexts, one per participant, against the local Next.js and PartyKit servers that `playwright.config.ts` starts for the run. Chromium launches with `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream --autoplay-policy=no-user-gesture-required`, so `getUserMedia` resolves without a prompt and LiveKit gets a real track.

- **One-time setup: `npx playwright install chromium`.** The project pins `channel: "chromium"`, so a fresh clone or CI runner fails at launch until the browser is downloaded. `npm ci` does not do it.
- **`NEXT_PUBLIC_PARTY_HOST` is pinned to `localhost:1999` in the webServer env**, so a `.env` pointing at the deployed PartyKit cannot silently take the room off the server under test. `reuseExistingServer` is on outside CI, so a stray server on either port would be used as-is: prefer the port overrides above.
- **YouTube never loads.** `e2e/fixtures/youtubeStub.ts` answers `https://www.youtube.com/iframe_api` with a wall-clock implementation of the `YT.Player` surface that `useYouTubePlayer` and `useVideoSync` drive, and exposes it as `window.__ytStub` so a test can read the exact playback position. The suite asserts the sync protocol and its UI, never pixels of a real embed.
- **No arbitrary sleeps.** Every wait is `expect` polling on a real condition.
- **`getByRole` name matching is substring by default.** "Mute microphone" matches "Unmute microphone". Any locator whose accessible name is a substring of a sibling state must pass `exact: true`; this has produced a green-looking test that clicked the opposite button.

## Writing

Never use em dashes. Use regular dashes (-) or rewrite the sentence. This applies to code, UI copy, commit messages, docs and PR text.

Comments in code only for non-obvious invariants the code cannot express, capped at 1-2 lines. Never comments that narrate the next line, cite where code came from, or argue the change is correct.

## Architecture

**Karaoke Now** (prod: `https://www.karaokenow.co`, the single canonical origin; `karaokenow.co`, `karaokenow.vietbrosinaus.com` and `karaoke-room.vercel.app` all 308-redirect to it, paths and queries preserved) is a real-time karaoke room app. Three systems work together:

1. **PartyKit** (`party/`) - Cloudflare Durable Objects for room state (participants, queue, chat, playback). The server in `party/index.ts` is a state machine with heartbeat-based cleanup (15s ping, 40s evict, 60s singer timeout).

2. **LiveKit** - SFU for WebRTC audio transport. Voice only: the singer publishes their mic through the voice effect chain as one track. Music never crosses LiveKit.

3. **Next.js 15** (App Router) - UI. The two backend endpoints moved to the worker (below); the `/api` routes are legacy passthroughs for cached shells.

### Backend Endpoints on the Worker

Token minting and YouTube search run as two PartyKit parties, `party/token.ts` (`/parties/token/<ROOMCODE>`) and `party/search.ts` (`/parties/search/global`), so a client with no browser origin (React Native, a bundled Capacitor shell) can reach them. Both call the same code as the Next routes: `src/shared/livekitToken.ts` and `src/shared/youtubeSearch.ts`, with the runtime's env passed in as an `EnvReader` (`src/shared/env.ts`) because a worker's `process.env` is empty.

- **The token party is sharded by room code, search is not.** A party room is one Durable Object in one colo, so pinning the join path to `global` would serialize every token mint worldwide through one instance. Sharding also makes the room the rate-limit and presence scope, and the endpoint 400s when the `room` query param disagrees with the party id. Search stays on `global` deliberately: it is hand-typed, so its rate is orders of magnitude lower, and one instance is what makes a per-IP brake mean anything.
- **The Next routes stay, and they are a live fallback, not dead weight.** `src/app/api/livekit-token/route.ts` and `src/app/api/youtube-search/route.ts` are marked legacy and are thin wrappers over the same shared functions. `fetchLiveKitToken`/`fetchYouTubeSearch` retry against the same-origin `/api` path when the worker answers 403 or cannot be reached, which is what keeps voice alive on a Vercel preview whose per-deployment origin no static allowlist can enumerate.
- **`src/lib/apiBase.ts` is the client's only URL builder** for our backend: `partyHost()`, `partyOrigin()`, `livekitTokenUrl()`, `youtubeSearchUrl()` and the two fetchers.
- **`party/http.ts` holds the two transport controls, and neither one is a general gate.** The `PARTY_ALLOWED_ORIGINS` allowlist decides whether a *browser* may read the response, and nothing else: a request with no `Origin` is not gated by it at all. It fails closed on a deployed host with the var unset, reflects only for local dev hostnames, normalizes case and trailing slashes, and accepts one `https://*.vercel.app`-shaped wildcard. The fixed-window rate limit (429 with `reason: "rate-limited"`, 120/min per IP per room for tokens, 20/min for search) is keyed on `CF-Connecting-IP` alone; `partykit dev` does not limit at all.
- **Anything that has to hold against a determined caller carries its own budget in Redis.** The YouTube daily `search.list` miss counter and the LiveKit key rotation state both live in `src/shared/`, because an in-memory per-instance counter can see neither the other instances nor the other IPs.
- **`keyHint=next` is a report, not an assertion.** Three distinct rooms reporting mark a key exhausted for every room on it, so `party/token.ts` only forwards the hint when the main party for that exact room id reports live participants. The client never sends it in response to a `rate-limited` 429 either: `src/hooks/livekit/connection.ts` backs off on `Retry-After` instead.

### Voice Pipeline (Critical Path)

The singer's audio pipeline in `src/hooks/livekit/capture.ts`:
```
getUserMedia (mic) -> Voice Effect Chain -> Mic GainNode
                                              |
                                  AudioContext.destination
                                              |
                                  publishTrack (LiveKit, Track.Source.Microphone)
```
`startSinging` runs automatically when the turn starts and `stopSinging` when it ends. All three of `startSinging`, `stopSinging` and `cleanupMix` live in `src/hooks/livekit/capture.ts`, and changes to them require careful review with the audio-path lens: list every changed line and justify each.

Hard-won invariants in this path:
- **Taking the stage never overrides an explicit mute.** The pipeline builds either way; a muted singer stays silent until they unmute themselves.
- **Mic requests queue, they do not drop.** `applyMicState` coalesces a request that lands mid-flight into a pending slot; dropping it once let a mute click vanish under the join auto-unmute.
- **Controls carry explicit intent.** The toolbar mic button passes the target state its label promised (`toggleMic(!isMicEnabled)`), never a bare toggle off a possibly-stale ref.
- **One capture per turn.** iOS permanently mutes the first `getUserMedia` when a second opens, so the turn boundary releases the managed mic before the singing capture opens, hot-swaps prefer in-place `applyConstraints` (verified against `getSettings()`), the mic check borrows the live singing stream, and the device probe never runs under a live capture (`hasAudioCaptureOwner()` in `src/lib/audioSession.ts` is the arbiter).
- **The capture profile is decided once**: `resolveCaptureProfile` in `src/lib/audioProfile.ts` is the only place channels, sample rate, NC choice, preset and dtx are chosen. Web adapters translate it; nothing re-decides it.

### Synced YouTube Playback (Critical Path)

Every client runs its own YouTube IFrame player. The singer is the clock authority:

```
singer player -> video-sync {playing, videoTime} -> PartyKit (stamps wallTime)
                                                        |
                                   video-state {video, serverTime} -> every client
                                                        |
        target = videoTime + (estimatedServerNow - wallTime)/1000 - offsetSec
        drift  = target - position  ->  rate nudge or seek
```

- `usePartyClock` estimates `serverOffset` from dedicated `time-sync` round trips. Never fold this into the ping/pong heartbeat: the server evicts on stale pongs.
- `useVideoSync` runs one ~300ms interval over refs only, so drift correction never re-renders the player, with a cancellation flag gating every post-await side effect.
- **`YouTubePlayerHandle` getters are async and `getTime()` returns `{seconds, readAt}`.** The sample carries its own timestamp so a future native bridge's round trip cannot bias the drift math; the drift loop anchors the server clock to `readAt`, never to "now after the await".
- `video-state` is a point broadcast, not `broadcastState()`, because it fires every ~2s.
- The player is created inside the AudioUnlockOverlay click, the only guaranteed user gesture per client, and is never unmounted afterwards.
- No user may touch the YouTube surface: `VideoStage` stacks a transparent blocker above the iframe, marks the player container `inert` (plus `tabindex=-1` on the frame for Safari), and the embed runs with `controls: 0, disablekb: 1`.
- **What YouTube will not give us**: no audio access (music energy and full-mix recording are impossible), no ad/stream-limit signals (error classification is best-effort), decode position rather than speaker position (a sync floor no tuning breaks). Design around these, do not fight them.

### Protocol Single Source

`src/shared/protocol.ts` is the only place the wire protocol is declared: every `ClientMessage`/`ServerMessage` variant and `RoomState`/`VideoState`/`ParticipantStatus`/`ChatMessage` is a Zod schema with the TypeScript type inferred from it. `party/types.ts` and `src/types/room.ts` are thin re-exports and **must never declare a type of their own**. The server imports the schemas by relative path (`../src/shared/protocol`); the client goes through `~/shared/protocol`.

`onMessage` runs every inbound message through `clientMessageSchema.safeParse` and answers a failure with the `Unknown message type` error reply, so handlers only ever see well-shaped payloads. The schemas stay structural: length caps, the emoji allowlist and the YouTube id check stay in the handlers.

Adding a message: (1) variant in `src/shared/protocol.ts`, (2) handler in `party/index.ts`, (3) case in `src/hooks/useRoomState.ts`, (4) wire in `RoomView.tsx`.

## Key Hooks

- **`useRoomState`** - PartyKit WebSocket, room state, chat, reactions. Returns `send()` for raw messages.
- **`useLiveKit`** - LiveKit connection, mic toggle, singing voice pipeline, voice effects, mic check. A ~115-line facade over four modules in `src/hooks/livekit/`: `context.ts` (shared refs/state/params), `connection.ts` (room connection, device/NC switches, `resumeRoomAudio`), `capture.ts` (the singer path), `micCheck.ts` (isolated loopback). `micWatch.ts` is the mic-death watchdog, rebinding through LiveKit's own track events.
- **`useYouTubePlayer`** - Injects the IFrame API once (module-level singleton promise) and owns the `YT.Player` instance behind a ref-stable async handle.
- **`useVideoSync`** - Drift correction loop plus the singer's 2s broadcast. The policy is `computeSyncAction`/`computeTarget` in `src/lib/syncMath.ts`; the hook owns only the interval, refs and seek cooldown.
- **`usePartyClock`** - `time-sync` sampler, returns `serverOffsetRef` (median of min-RTT samples).
- **`useSingerAudio`** - The one place that reaches into the LiveKit `Room` for the singer: `getTrack()` and `getStats()` callbacks.
- **`useAudioLevel`** - Smoothed 0..1 meter level from any `() => number` source.
- **`useAudioDevices`** - Device enumeration, mic mode, Bluetooth route detection, and the Android built-in-mic preference (`builtInInputDeviceId`, null the moment the user picks a device explicitly).
- **`useVolumeMix`** - Single source of truth for master, music and per-person `{volume, muted}`.
- **`useWakeLock`**, **`useFlag`**, **`usePartySocket`** - as named.

## Voice Effects

`src/lib/voiceEffects.ts` - Pure Web Audio API, zero dependencies. Each effect returns `{ input, output, cleanup, setWetDry }`. Effects: Hall, Echo, Warm/Bright, Chorus. `parseStoredVoiceEffect`/`parseStoredWetDry` are the stored-preference parsers.

## Audio Reliability

The platform quirk catalog and our standing against it live in `docs/qa/AUDIO-QUIRKS-AUDIT.md` (verdict per quirk, fix status) and `docs/qa/AUDIO-TEST-MATRIX.md` (the device test sheet). The recovery surfaces, all deliberate:

- **"Can't hear?" toolbar pill**: always rendered, never signal-gated, because Android's force-fade and some iOS strandings leave no web-visible trace. It runs `resumeRoomAudio` (single-flight guarded) which resumes and, when needed, rebuilds the mixer graph with gains replayed.
- **"Tap to hear the room" banner**: promoted version of the same control when the browser reports blocked playback (`canPlaybackAudio`) or the mixer holds a settled stall.
- **"Mic stopped, tap to restart"**: the `micWatch` watchdog's surface. One automatic recovery attempt on returning to visibility; after that only the tap. Recovery never unmutes an explicitly muted user.
- **Bluetooth**: opening any BT mic drops the whole link to phone-call quality (HFP), and on iOS the web cannot prevent it (`docs/plans/2026-08-17-bluetooth-hfp-research.md` has the sourced detail). We detect the route and say so; on Android we prefer the built-in mic when BT output is active and no explicit pick exists; on iOS `navigator.audioSession.type` is `playback` whenever nothing captures. `src/lib/audioRoutes.ts` owns the label heuristics (wired markers checked before Bluetooth markers, route-following pseudo-devices never pinned).

## Logging

Nothing in `src/` or `party/` may name `console`: biome's `suspicious/noConsole` is an error, and `src/shared/log.ts` is the one file with an override.

- **`src/shared/log.ts`** is the core both runtimes wrap; it holds no state that outlives a call because it is bundled into the Durable Object and the Next server.
- **`src/lib/logger.ts`** - `createLogger("LiveKit")` returns `debug/info/warn/error` with the bracket prefix (`[LiveKit] ...`). In production `debug`/`info` are dropped unless the debug gate is on (`karaoke-debug` in localStorage or `?debug` on any URL, persisted; `?debug=0` clears). `warn`/`error` always emit. Suppressed lines are gone, not retained.
- **Namespaces are per module family**: `LiveKit`, `RoomState`, `PartySocket`, `AudioDevices`, `apiBase`, `KeyRotation`, `LiveKitToken`, `YouTubeSearch`, `tRPC`.
- **`party/log.ts`** is the worker's twin, gated on `PARTY_DEBUG`, armed via `configurePartyLog(this.room.env)` in `onStart()` (or at the top of `onRequest` for parties without one).
- **`logger.error` is also the error-analytics path**: it feeds `app_error` through the sink `src/lib/analytics.ts` registers.

## Analytics

PostHog (US cloud), client only, a full no-op unless `NEXT_PUBLIC_POSTHOG_KEY` is set; the SDK sits behind a dynamic import that never runs without a key. `src/lib/analytics.ts` owns the whole surface: a typed event union, `track(event, props)`, an anonymous device id.

- **The event union is the contract.** Adding an event means a variant in `EventProps` plus a row in `docs/design/ANALYTICS.md`, in the same change.
- **Instrument the existing seam**, the handler that carries the user's intent; never restructure a component to host an event.
- **Never sent**: display names, chat content (length bucket only), video ids/titles, room codes (a salted local marker answers "been here before"), error stacks. Autocapture, replay, pageviews, surveys off; DNT honoured before the SDK is fetched.
- **The capture flags are not enough on their own.** PostHog attaches `$current_url`/`$pathname`/referrer copies to every event regardless, and the room page path *is* the room code. `POSTHOG_PROPERTY_DENYLIST` plus the `sanitize_properties` hook stops that, and the hook drops any URL-valued property whatever a future SDK calls it.
- **Analytics is never load-bearing**: `track` swallows a throwing vendor and is called after the action it reports.

## Patterns

- **Refs over state** for values accessed in callbacks/timeouts (`isMicEnabledRef`, `talkingNCRef`, `singingNCRef`, `voiceEffectRef`).
- **Listening is local, per user** (see Product Principles): the wire carries no message that mutes, unmutes or sets the gain of anyone else, and `RoomState` carries no per-user audio field. `isDeafened` crosses the wire as a read-only roster glyph and no receiving client acts on it.
- **`videoState` is server-owned**: in `RoomState` so late joiners catch up, cleared at every site that clears `currentSingerId`. Only `currentSingerId` may send `video-load`/`video-sync`.
- **Room identity is persisted, the session is not**: `roomName`, `isPublic`, `passwordHash`, `adminClientId`, `adminVacatedAt` and `bannedClientIds` are write-through to `this.room.storage` and rehydrated in `onStart()`. Chat, queue, participants and `videoState` stay in memory by design. A kick is permanent for that room code until the 200-entry LRU evicts it.
- **Admin succession never deadlocks**: a vacant seat belongs to the departed admin for `ADMIN_GRACE_MS`, but only the timer hands it on; `armAdminGrace()` is called from `claimAdminOnJoin` as well as `startAdminGrace`.
- **Clock-authority stall detection**: the singer's `video-sync` stream is the room's playback heartbeat; 10s of silence while playing pauses the room with a system chat line. `stalled: true` re-arms without re-stamping a frozen position. The singer's page broadcasts a pause on `visibilitychange`.
- **Feature flags are room-scoped** (`RoomState.flags`, seeded from `FEATURE_FLAGS`), because one participant on a different sync path is a correctness bug, not an experiment.
- **Narrow props below RoomView**: no component under `RoomView` takes the LiveKit `Room`; RoomView turns the transport into callbacks. Meters call `useAudioLevel` themselves so a 75ms tick re-renders one leaf.
- **Per-person volume**: `useVolumeMix` owns master, music and per-person `{volume, muted}` keyed by `personMixKey`. One volume per person, both modes, mute holds in both. Old two-slot blobs migrate on read (`talk` becomes `volume`, `stage` dropped). Gains push into `src/lib/voiceMixer.ts` (`source -> personGain -> masterBus -> duck -> limiter -> output`); the mixer also owns each `<audio>` element's volume (0 while the graph is audible, the full local mix in element fallback, with mute expressed through `el.muted` because iOS ignores element volume). Every gain decision is `resolveGains` in `src/lib/volumeModel.ts`. Nothing is ever broadcast.

## Styling and Design Language

- **Tailwind CSS 4** + inline styles with CSS variables. No hardcoded colors; every color through `var(--color-*)`.
- **Borderless elevation**: depth is a tone step plus a layered shadow (`--color-dark-bg/surface/card/raised`, `--shadow-elevation-0..3`, `--shadow-control` for the inset control edge). Borders are for inputs, focus, danger and active states only. No full-bleed divider lines or bands inside rounded panels: they read as square corners against the rounded silhouette; float internal sections as inset rounded rows instead.
- **Semantic colors**: primary follows the playing song (see Atmosphere); amber is host, red is danger/attention, green is success, and those stay static.
- **Fonts**: Baloo 2 (`var(--font-display)`) for headings/buttons, Be Vietnam Pro (`var(--font-body)`) for body, both via `next/font/google` with the Vietnamese subsets.
- **Icons**: `lucide-react` only. No emojis in UI; emojis only in chat and the reaction bar. Icon vocabulary is strict: speaker glyphs (`Volume2`/`VolumeX`) mean local listening state, mic glyphs (`Mic`/`MicOff`) mean actual microphone state; one glyph never carries two meanings on one screen.
- **Radii come from the tokens** (`rounded-xl` = `var(--radius-xl)` etc.); never hardcode a pixel radius next to token-radius siblings.
- **shadcn/ui (base-nova, Base UI primitives)** in `src/components/ui/`. Base UI quirks: `Select` `onValueChange` passes `string | null`; `SelectValue` renders the raw value unless given a function child; `Switch` renders a `button` (use `render` + `nativeButton={false}` inside other buttons); `TooltipTrigger` swallows `disabled` unless given a rendered button.
- **Component conventions**: named exports only, props interface above component, PascalCase components / camelCase hooks-utils, `"use client"` at the top of every component and hook file.
- **Biome is linter-only**: the formatter and import assist are off on purpose. Rules that fight the existing style are disabled with a written reason in the config.

## Atmosphere Layer

A third token layer on top of the primitives and the shadcn semantic layer. `src/lib/atmosphere.ts` registers fifteen typed `@property` custom properties (`--atmo-a/b/c`, `-glow`, `-tint`, `-accent` family, `-strength`, `-pulse`, `-saturation`, `-warmth`, `-contrast`) so the between-song colour change cross-fades natively over 2s; `applyAtmosphere` on `document.documentElement` is the only writer.

- **Surfaces consume the contract, never the inputs**: `.atmo-mesh` (page wash), `.atmo-halo` (long-range glow behind every panel; the near `.atmo-frame` glow paints under the opaque rails, so long reach must live behind them), `.atmo-glass` (panel tint), `.atmo-card`.
- **Gradient falloffs are two-step**: a hard `transparent N%` stop paints a visible terminator arc that reads as a square corner where it crosses a panel edge.
- **Primary is atmosphere-driven; only the hue moves.** `composeAtmosphere` pins each accent band to the idle violet's oklch lightness, clamps chroma into sRGB with `srgbSafeChroma`, and `avoidDangerHue` keeps the accent out of the red window. **The palette extracts hues on the HSL wheel and tokens are oklch, whose wheels differ: every palette hue passes through `hslHueToOklchHue` or a blue thumbnail renders teal.**
- **White-on-primary CTAs ramp `var(--color-primary)` toward black**, never toward `-bright` (white on `-bright` is ~1.7:1). `-soft`/`-bright`/`-level` are for text and icons on dark panels only.
- **The `auto` provider**: thumbnail hue decides colour, genre decides behaviour, idle rooms hold the Neon Pulse violet. `--atmo-strength` is the singer's live voice level (the only measurable energy; YouTube audio never reaches the page) written on a ~100ms tick by `AudioVisualizer` alone.

## PWA and Service Worker

`public/sw.js` is an app-shell cache, registered in production builds only. It **must never cache API routes, PartyKit, LiveKit or YouTube**: it bails on cross-origin, `/api/`, `/parties/` and a host denylist. Navigations are network-first with `/offline` fallback; hashed `_next/static` assets cache-first. Cache busting keys the cache on `NEXT_PUBLIC_SW_VERSION` (commit SHA) with `skipWaiting` + `clientsClaim`.

Working consequence: a long-lived tab or installed PWA serves the previous shell until refresh; treat "still broken" reports accordingly.

## Environment

PartyKit-side: `REGISTRY_TOKEN` (required in production), `PARTY_ALLOWED_ORIGINS` (required in production; `https://www.karaokenow.co` is the only origin that executes the app since every other domain 308-redirects to it, but the legacy origins stay listed as harmless belt-and-braces), `FEATURE_FLAGS` (optional), `PARTY_DEBUG` (optional), plus the LiveKit, Upstash and YouTube vars because the token and search endpoints run on the worker.

Required: `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL`, `NEXT_PUBLIC_LIVEKIT_URL`. Optional: `NEXT_PUBLIC_PARTY_HOST` (defaults `localhost:1999`), `UPSTASH_REDIS_REST_URL`/`_TOKEN`, `LIVEKIT_API_KEY_N` (auto-discovered to `_20`), `YOUTUBE_API_KEY`, `NEXT_PUBLIC_POSTHOG_KEY`/`NEXT_PUBLIC_POSTHOG_HOST`. See `docs/IDEOLOGY.md` for key rotation and `docs/design/ANALYTICS.md` for the taxonomy.

Path alias: `~/*` maps to `./src/*`. TypeScript strict mode with `noUncheckedIndexedAccess`.

## Deployment

- **Next.js**: Vercel auto-deploys from GitHub on push to main, aliased to `www.karaokenow.co`. If a push produces zero commit statuses, the GitHub webhook was missed (check githubstatus.com): re-trigger with an empty commit once webhooks recover, or `npx vercel --prod --yes` (the CLI is authenticated on this machine) deploys directly.
- **PartyKit**: `npm run deploy:party` after `party/` or `src/shared/` changes.
- **PartyKit secrets** via `partykit env add` (interactive; when piping, `printf %s "$VAL"` without a trailing newline, which otherwise becomes part of the stored value and breaks URL parsing): `REGISTRY_TOKEN`, `PARTY_ALLOWED_ORIGINS`, `LIVEKIT_API_KEY`/`_SECRET`/`_URL` (plus `_N` variants), `UPSTASH_REDIS_REST_URL`/`_TOKEN`, `YOUTUBE_API_KEY`. Set them **before** the deploy. `partykit dev` reads them from `.env`.
- **The LiveKit key variant set on PartyKit must be byte-identical to Vercel's, gaps included**: `room:<code>:key` stores an index into the scan, so a variant present on one host and missing on the other splits a room across two LiveKit projects. `room:<code>:keyfp` detects the mismatch loudly; it does not fix it.
- **PartyKit ships first, and the merge cannot choose otherwise.** `.github/workflows/deploy-partykit.yml` fires on `party/**`, `partykit.json` or `src/shared/**`, deploys, health-checks `/parties/main/health-probe` then `/parties/token/HEALTH?room=HEALTH&name=healthcheck`, and only then POSTs the Vercel deploy hook, racing Vercel's own git build. Additive protocol changes want that order anyway. A change that needs Vercel-first needs a mechanism: split it across two merges, client-side first.
- **A protocol removal has to be safe in either order.** A stale client sending the removed variant gets the `Unknown message type` reply and the socket stays up; a removed `RoomState` field arrives as `undefined` on old bundles and must degrade sanely (the client never runtime-validates server messages).
- `concurrency: partykit-deploy` with `cancel-in-progress: false` keeps two merges from deploying out of order.
- **`VERCEL_DEPLOY_HOOK_URL` secret** (optional, GitHub Actions): chains a Vercel redeploy after the PartyKit health check; when absent the workflow logs and skips.
- Watch a deploy with `gh api repos/vietbrosinaus/karaoke-now/commits/<sha>/status --jq .state`.
- **Annotate meaningful deploys in PostHog** so graph spikes correlate to releases: `curl -s -X POST https://us.posthog.com/api/projects/563535/annotations/ -H "Authorization: Bearer $POSTHOG_PERSONAL_API_KEY" -H "Content-Type: application/json" -d '{"content":"<one line>","scope":"project"}'` (the key lives in `.env`, gitignored). Dashboards: Product Pulse and Audio Health, both API-managed; add insights through the API so they stay reproducible.

## Review and Audit Patterns

For substantive changes, run two parallel adversarial reviewers over `git diff` with distinct lenses drawn from:
1. Bug scan: logic errors, races (especially async gaps in the sync loop and mic-state machine)
2. Regression vs invariants: explicit mute survives every new path, coalescing holds, desktop unaffected by mobile ordering
3. Protocol consistency: schema variant, server handler, client case all present; removal safe in either deploy order
4. Audio path impact: `startSinging`/`stopSinging`/`cleanupMix` changes listed line by line
5. State/cleanup: AudioContexts closed, MediaStreams stopped, timers cleared, effects with correct deps
6. Privacy: nothing new reaches the wire or the analytics vendor that the taxonomy does not name
7. UX coherence: icon vocabulary, copy tone (no em dashes), banner stacking, mobile layouts

Reviewers must substantiate findings from the diff and code; the fix pass answers every confirmed finding or names it a false positive with evidence.

Production audit:
1. Dangling LiveKit rooms: `RoomServiceClient.listRooms()` with the `.env` credentials
2. PartyKit health: `curl https://karaoke-room.elvistranhere.partykit.dev/parties/main/health-probe`
3. AudioContexts closed on disconnect, intervals cleared on unmount, `videoState` cleared on room empty
4. PostHog `app_error` dashboard for new error namespaces after a deploy

## Mobile Track

Decision (2026-08-17, `docs/design/MOBILE-STACK-DECISION.md`): pivot to **React Native + Expo**, staged behind two device spikes with kill criteria; the Capacitor scaffold (`capacitor.config.ts`) stays frozen, not deleted. The pure core (protocol, syncMath, volumeModel, atmosphere logic, audioProfile) ports as-is; native audio goes through `@livekit/react-native` with `autoConfigureAudioSession: false` (its defaults reproduce the Bluetooth HFP bug); YouTube goes through the vendored bridge protocol, never a prop-driven wrapper. `docs/design/AUDIO-ARCHITECTURE.md` is the layer map; the port interface is extracted only when the first native driver exists, never before. Toolchains (Xcode 26, Android Studio, OpenJDK 21 with `JAVA_HOME`/`ANDROID_HOME` in `~/.zshrc`) are installed on this machine.

## Docs Index

- `docs/design/AUDIO-ARCHITECTURE.md` - audio layer map, draft driver port, seam status
- `docs/design/MOBILE-STACK-DECISION.md` - the RN pivot, spikes, kill criteria
- `docs/design/KARAOKE-PRIOR-ART.md` - competitor/vendor architectures, ranked adoptions (scheduled-start pre-roll is the top sync upgrade), mined test scenarios
- `docs/design/ANALYTICS.md` - event taxonomy and privacy rules
- `docs/qa/AUDIO-QUIRKS-AUDIT.md` - platform quirk verdicts and fix status
- `docs/qa/AUDIO-TEST-MATRIX.md` - the device test sheet with the 10-minute smoke subset
- `docs/plans/2026-08-17-bluetooth-hfp-research.md` - why Bluetooth degrades and what each layer can do
- `docs/plans/2026-08-17-capacitor-status.md` - frozen Capacitor scaffold and owner-blocked items
- `docs/IDEOLOGY.md` - LiveKit key rotation architecture
