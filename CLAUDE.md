# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev:all          # Next.js (3000) + PartyKit (1999) — use this for local dev
npm run dev              # Next.js only
npm run dev:party        # PartyKit only
npm run lint             # biome lint . (linter only, formatter disabled)
npm run typecheck        # tsc --noEmit
npm run test             # vitest run (pure-function tests under src/**/*.test.ts)
npm run e2e              # playwright test (two-client browser suite under e2e/)
npm run build            # Production build
npm run deploy:party     # Deploy PartyKit server to Cloudflare
```

Vitest covers the pure models only (`src/lib/syncMath.ts`, `src/lib/volumeModel.ts`, `src/shared/protocol.ts`, the logging gate and analytics privacy helpers in `src/lib/logger.ts` and `src/lib/analytics.ts`, plus the security-relevant pure functions in `party/http.ts` and `src/lib/apiBase.ts`); there is no component test layer. The include list is `src/**/*.test.ts` and `party/**/*.test.ts`. Verify changes with `npm run lint`, `npm run typecheck` and `npm run test`, plus `npm run build` when routing, config, or the service worker changed.

## Playwright E2E

`e2e/` drives real browser contexts, one per participant, against the local Next.js and PartyKit servers that `playwright.config.ts` starts for the run. Chromium launches with `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream --autoplay-policy=no-user-gesture-required`, so `getUserMedia` resolves without a prompt and LiveKit gets a real track.

- **One-time setup: `npx playwright install chromium`.** The project pins `channel: "chromium"`, so a fresh clone or CI runner fails at launch with "Chromium distribution 'chromium' is not found" until the browser is downloaded. `npm ci` does not do it.
- **`NEXT_PUBLIC_PARTY_HOST` is pinned to `localhost:1999` in the webServer env**, so a `.env` pointing at the deployed PartyKit cannot silently take the room off the server under test. Override the ports with `E2E_NEXT_PORT` and `E2E_PARTY_PORT` when 3000 or 1999 is already taken by something other than this app; `reuseExistingServer` is on outside CI, so a stray server on either port would be used as-is.
- **YouTube never loads.** `e2e/fixtures/youtubeStub.ts` answers `https://www.youtube.com/iframe_api` with a wall-clock implementation of the `YT.Player` surface that `useYouTubePlayer` and `useVideoSync` drive, and exposes it as `window.__ytStub` so a test can read the exact playback position. Thumbnails and the genre lookup are stubbed to the empty answers both call sites already handle. The suite asserts the sync protocol and its UI, never pixels of a real embed.
- **No arbitrary sleeps.** Every wait is `expect` polling on a real condition: an attribute on the entry overlay, a rendered participant row, or a player position.

## Git

Do NOT include `Co-Authored-By` lines in commit messages.

## Writing

Never use em dashes (—). Use regular dashes (-) or rewrite the sentence.

## Architecture

**Karaoke Now** is a real-time karaoke room app. Three systems work together:

1. **PartyKit** (`party/`) — Cloudflare Durable Objects for room state (participants, queue, chat, playback). The server in `party/index.ts` is a state machine with heartbeat-based cleanup (15s ping, 40s evict, 60s singer timeout).

2. **LiveKit** - SFU for WebRTC audio transport. Voice only: the singer publishes their mic through the voice effect chain as one track. Music never crosses LiveKit.

3. **Next.js 15** (App Router) — UI. The two backend endpoints moved to the worker (below); the `/api` routes are legacy passthroughs for cached shells.

### Backend Endpoints on the Worker

Token minting and YouTube search run as two PartyKit parties, `party/token.ts` (`/parties/token/<ROOMCODE>`) and `party/search.ts` (`/parties/search/global`), so a client with no browser origin (React Native, a bundled Capacitor shell) can reach them. Both call the same code as the Next routes: `src/shared/livekitToken.ts` and `src/shared/youtubeSearch.ts`, with the runtime's env passed in as an `EnvReader` (`src/shared/env.ts`) because a worker's `process.env` is empty.

- **The token party is sharded by room code, search is not.** A party room is one Durable Object in one colo, so pinning the join path to `global` would serialize every token mint worldwide through one instance. Sharding also makes the room the rate-limit and presence scope, and the endpoint 400s when the `room` query param disagrees with the party id. Search stays on `global` deliberately: it is hand-typed, so its rate is orders of magnitude lower, and one instance is what makes a per-IP brake mean anything. That single instance is a throughput ceiling; move it to a shard key if search ever lands on a hot path.
- **The Next routes stay, and they are a live fallback, not dead weight.** `src/app/api/livekit-token/route.ts` and `src/app/api/youtube-search/route.ts` are marked legacy and are thin wrappers over the same shared functions. PartyKit deploys before Vercel, so a shell cached before the switch keeps calling `/api` until it refreshes; and `fetchLiveKitToken`/`fetchYouTubeSearch` retry against the same-origin `/api` path when the worker answers 403 or cannot be reached, which is what keeps voice alive on a Vercel preview whose per-deployment origin no static allowlist can enumerate. Delete them only after both of those stop mattering.
- **`src/lib/apiBase.ts` is the client's only URL builder** for our backend: it resolves the same `NEXT_PUBLIC_PARTY_HOST` the socket uses and hands back `partyHost()`, `partyOrigin()`, `livekitTokenUrl()`, `youtubeSearchUrl()` and the two fetchers above.
- **`party/http.ts` holds the two transport controls, and neither one is a general gate.** The `PARTY_ALLOWED_ORIGINS` allowlist decides whether a *browser* may read the response, and nothing else: a request with no `Origin` (native client, `<img src>`, `<script src>`, a top-level navigation) is not gated by it at all, so it stops cross-origin credential theft and no other attack. It fails closed the way `party/registry.ts` does - on a deployed host with the var unset a browser origin is refused rather than reflected - reflects only for local dev hostnames, normalizes case and trailing slashes so a config typo cannot black-hole the app, and accepts one `https://*.vercel.app`-shaped wildcard for preview origins. The fixed-window rate limit (429 with `reason: "rate-limited"`, 120/min per IP per room for tokens, 20/min for search) is therefore the only control on origin-less traffic, and it is keyed on `CF-Connecting-IP` alone: `X-Forwarded-For` is caller-supplied, so a deployed worker without the edge header buckets everything as `untrusted` and `partykit dev` does not limit at all.
- **Anything that has to hold against a determined caller carries its own budget in Redis.** The YouTube daily `search.list` miss counter (`yt-quota:<date>`, 80 misses of the 10k unit budget, then the existing empty fail-soft) and the LiveKit key rotation state both live in `src/shared/`, because an in-memory per-instance counter can see neither the other instances nor the other IPs.
- **`keyHint=next` is a report, not an assertion.** It writes `key:N:report_rooms`, and three distinct rooms reporting mark a key exhausted for every room on it. Room codes are free to invent, so `party/token.ts` only forwards the hint when the main party for that exact room id reports live participants, and the legacy `/api/livekit-token` route runs the same gate over HTTP because it reaches the same Redis. The client never sends it in response to a `rate-limited` 429 either: `src/hooks/livekit/connection.ts` backs off on `Retry-After` instead.

### Voice Pipeline (Critical Path)

The singer's audio pipeline in `src/hooks/livekit/capture.ts`:
```
getUserMedia (mic) → Voice Effect Chain → Mic GainNode
                                              ↓
                                  AudioContext.destination
                                              ↓
                                  publishTrack (LiveKit, Track.Source.Microphone)
```
`startSinging` runs automatically when the turn starts and `stopSinging` when it ends. All three of `startSinging`, `stopSinging` and `cleanupMix` live in `src/hooks/livekit/capture.ts`, and changes to them require careful review.

### Synced YouTube Playback (Critical Path)

Every client runs its own YouTube IFrame player. The singer is the clock authority:

```
singer player → video-sync {playing, videoTime} → PartyKit (stamps wallTime)
                                                        ↓
                                   video-state {video, serverTime} → every client
                                                        ↓
        target = videoTime + (estimatedServerNow - wallTime)/1000 - offsetSec
        drift  = target - player.getCurrentTime()  →  rate nudge or seek
```

- `usePartyClock` estimates `serverOffset` from dedicated `time-sync` round trips. Never fold this into the ping/pong heartbeat: the server evicts on stale pongs.
- `useVideoSync` runs one ~300ms interval over refs only, so drift correction never re-renders the player.
- `video-state` is a point broadcast, not `broadcastState()`, because it fires every ~2s.
- The player is created inside the AudioUnlockOverlay click, the only guaranteed user gesture per client, and is never unmounted afterwards.
- No user may touch the YouTube surface: `VideoStage` stacks a transparent blocker above the iframe, marks the player container `inert` (plus `tabindex=-1` on the frame for Safari), and the embed runs with `controls: 0, disablekb: 1`.

### Protocol Single Source

`src/shared/protocol.ts` is the only place the wire protocol is declared: every `ClientMessage`/`ServerMessage` variant and `RoomState`/`VideoState`/`ParticipantStatus`/`ChatMessage` is a Zod schema with the TypeScript type inferred from it. `party/types.ts` and `src/types/room.ts` are thin re-exports and **must never declare a type of their own**. The server imports the schemas by relative path (`../src/shared/protocol`), which partykit's bundler resolves; the client goes through `~/shared/protocol`.

`onMessage` runs every inbound message through `clientMessageSchema.safeParse` and answers a failure with the `Unknown message type` error reply, so handlers only ever see well-shaped payloads. The schemas stay structural: length caps, the emoji allowlist and the YouTube id check stay in the handlers, where each has its own error reply.

## Key Hooks

- **`useRoomState`** — PartyKit WebSocket, room state, chat, reactions. Returns `send()` for raw messages.
- **`useLiveKit`** - LiveKit connection, mic toggle, singing voice pipeline, voice effects, mic check (live loopback). The most complex hook, and the only one that is split: `src/hooks/useLiveKit.ts` is a ~115-line facade that composes four modules under `src/hooks/livekit/`. `context.ts` owns the shared refs, state and `UseLiveKitParams`; `connection.ts` owns the room connection and the device/NC switch effects; `capture.ts` owns the singer path (`startSinging`, `stopSinging`, `cleanupMix`, `toggleMic`, the voice effect chain); `micCheck.ts` owns the isolated loopback context.
- **`useYouTubePlayer`** - Injects the IFrame API once (module-level singleton promise) and owns the `YT.Player` instance behind a ref-stable handle.
- **`useVideoSync`** - Drift correction loop plus the singer's 2s broadcast. The policy itself is `computeSyncAction`/`computeTarget` in `src/lib/syncMath.ts`; the hook only owns the interval, the refs and the seek cooldown.
- **`usePartyClock`** - `time-sync` sampler, returns `serverOffsetRef` (median of min-RTT samples, computed by `estimateClockOffset`).
- **`useSingerAudio`** - The one place that reaches into the LiveKit `Room` for the singer: returns a `getTrack()` and a `getStats()` callback, both null while there is no room or no singer.
- **`useAudioLevel`** - Smoothed 0..1 meter level from any `() => number` source, used for the toolbar mic meter and the stage meter.
- **`useAudioDevices`** — Device enumeration, mic mode (`"voice"` = NC on, `"raw"` = NC off).
- **`useWakeLock`** - Screen wake lock while in a room, feature-detected, re-requested on `visibilitychange`, released on unmount.
- **`useFlag`** - Reads a room-scoped feature flag out of `RoomState.flags`.
- **`usePartySocket`** — Low-level PartyKit WebSocket wrapper with auto-reconnect.

## Voice Effects

`src/lib/voiceEffects.ts` — Pure Web Audio API, zero dependencies. Each effect returns `{ input, output, cleanup, setWetDry }`. Effects: Hall (feedback delay network), Echo (delay + feedback), Warm/Bright (BiquadFilter EQ), Chorus (LFO-modulated delay).

## Logging

Nothing in `src/` or `party/` may name `console`: biome's `suspicious/noConsole` is an error, and `src/shared/log.ts` is the one file with an override.

- **`src/shared/log.ts`** is the core both runtimes wrap: the levels, the bracket prefix and the console call, plus `createSharedLogger` for the dual-runtime modules under `src/shared/`. It holds no state that outlives a call. That is deliberate: this file is bundled into the Durable Object and the Next server, where a module-level buffer would be one user's data sitting in another user's process.
- **`src/lib/logger.ts`** - `createLogger("LiveKit")` returns `debug/info/warn/error` and prints the same bracket prefix the app always had (`[LiveKit] ...`), so a namespace is what you grep for. In production `debug` and `info` are dropped unless the debug gate is on; `warn` and `error` always emit. The gate is `karaoke-debug` in localStorage or `?debug` on any URL, which persists (`?debug=0` clears it). A suppressed line is gone, not retained: nothing keeps log details anywhere, because they hold display names, device labels and raw wire frames.
- **Namespaces are per module family**, not per file: `LiveKit` (all of `src/hooks/livekit/`), `RoomState`, `PartySocket`, `AudioDevices`, `apiBase`, `KeyRotation`, `LiveKitToken`, `YouTubeSearch`, `livekit-token`, `tRPC`.
- **`party/log.ts`** is the worker's twin, same levels and prefix, gated on the `PARTY_DEBUG` env var. A Durable Object has no `process.env`, so `configurePartyLog(this.room.env)` is what arms the gate: `party/index.ts` calls it in `onStart()`, and `party/token.ts` and `party/search.ts` call it at the top of `onRequest` because they have no `onStart`. It arms the same gate `createSharedLogger` reads, so the `src/shared/` half of the worker's logging obeys `PARTY_DEBUG` too. Parties that only log `warn`/`error` need no call, because those always emit.
- **`logger.error` is also the error-analytics path**: it feeds `app_error` through the sink `src/lib/analytics.ts` registers, so an error branch needs no analytics call of its own.

## Analytics

PostHog, client only, and a full no-op unless `NEXT_PUBLIC_POSTHOG_KEY` is set: the SDK sits behind a dynamic `import("posthog-js")` that never runs without a key, so dev, CI and the e2e suite never load it. `src/lib/analytics.ts` owns the whole surface: a typed event union, `track(event, props)`, and an anonymous device id in localStorage.

- **The event union is the contract.** Adding an event means a variant in `EventProps` plus a row in `docs/design/ANALYTICS.md`, in the same change. The two `track` overloads make a wrong or missing payload a compile error.
- **Instrument the existing seam**, the handler that carries the user's intent, and never restructure a component to host an event.
- **Never sent**: display names, chat content (a length bucket only), video ids/titles, room codes (a salted local marker answers "been here before" and never leaves localStorage), or error stacks. Autocapture, session replay, pageviews and surveys are all off, and Do Not Track is honoured before the SDK is fetched.
- **The capture flags are not enough on their own.** PostHog attaches `$current_url`, `$pathname`, `$referrer` and their `$initial_*`/`$session_entry_*` copies to every event whatever those flags say, and the room page path *is* the room code (a legacy share link carries the display name too). `POSTHOG_PROPERTY_DENYLIST` plus the `sanitize_properties` hook in `src/lib/analytics.ts` is what stops that, and the hook also drops any URL-valued property whatever a future SDK calls it.
- **Analytics is never load-bearing**: `track` swallows a throwing vendor, and it is called after the action it reports, never before. Three of the call sites are the audio-recovery taps.
- **A local write an event needs is gated too**: `analyticsEnabled()` is checked before `markRoomVisited`, so a Do Not Track browser is left with no room history either. `docs/design/ANALYTICS.md` is the full taxonomy and the privacy rules.

## Patterns

- **Refs over state** for values accessed in callbacks/timeouts to avoid stale closures (`isMicEnabledRef`, `talkingNCRef`, `singingNCRef`, `voiceEffectRef`).
- **Hot-swap while singing**: NC toggle and voice effect changes re-capture the mic stream or rebuild the effect chain live without stopping the published track.
- **Mic check uses separate AudioContext**: Routes mic → effect chain → `ctx.destination` (speakers) for self-monitoring. Completely isolated from the singing mix path.
- **Listening is local, per user**: no participant may change another participant's audio state. The wire carries no message that mutes, unmutes or sets the gain of anyone else, and `RoomState` carries no per-user audio field. The singer controls shared playback (`video-load`, `video-sync`, play/pause/restart) and their own pipeline; the admin allowlist is kick, transfer admin, skip singer, remove from queue and room settings (name, public, password). `isDeafened` crosses the wire as a read-only roster glyph and no receiving client acts on it.
- **`videoState` is server-owned**: Included in `RoomState` so late joiners catch up mid-song, and cleared at every site that clears `currentSingerId`. Only `currentSingerId` may send `video-load`/`video-sync`.
- **Room identity is persisted, the session is not**: `roomName`, `isPublic`, `passwordHash`, `adminClientId`, `adminVacatedAt` and `bannedClientIds` are write-through to `this.room.storage` and rehydrated in `onStart()`, so a DO restart or an empty-room moment keeps the room's identity. Chat, queue, participants and `videoState` stay in memory by design and are still cleared when the room empties. Because a password now outlives an empty room, there is no first-joiner exemption on `auth`. A kick ban outlives it too: there is no unban message, so a kick is permanent for that room code until the 200-entry LRU evicts it.
- **Admin succession never deadlocks**: a vacant seat with a known `adminClientId` belongs to the departed admin for `ADMIN_GRACE_MS`, but only the timer hands it on. `armAdminGrace()` is therefore called from `claimAdminOnJoin` as well as `startAdminGrace`, arming whatever is left of the window (`adminVacatedAt` is persisted for exactly this), because a room that emptied never armed a timer and a DO restart loses both the timer and `adminVacatedAt`.
- **Clock-authority stall detection**: the singer's `video-sync` stream is the room's playback heartbeat. `resetVideoStallTimer()` re-arms a 10s timer on every sync while `videoState.playing`; if it fires, the server pauses the room, broadcasts `video-state` and posts a system chat line. A rebuffering singer sends `video-sync` with `stalled: true`, which re-arms the timer without re-stamping a frozen position, so an ordinary rebuffer is not read as a dead device. The singer's page also broadcasts a pause on `visibilitychange` so a backgrounded phone hands the clock back immediately, and resumes when the page is visible again.
- **Feature flags are room-scoped**: `RoomState.flags` is seeded from the PartyKit `FEATURE_FLAGS` env var (comma-separated names, each set to `true`) and read on the client with `useFlag(roomState, name)`. Room-scoped rather than user-scoped, because one participant on a different sync path is a correctness bug, not an experiment.
- **Narrow props below RoomView**: no component under `RoomView` takes the LiveKit `Room`. `Toolbar` takes a `getMicLevel` callback, `StageBanner` takes a `getSingerLevel` callback, `AudioVisualizer` takes a `getSingerTrack` callback, and `useAutoSyncOffset` takes a stats provider. `RoomView` is where the transport is turned into those callbacks. The meters call `useAudioLevel` on the getter themselves, so a 75ms level tick re-renders one leaf instead of the whole room.
- **Per-person volume**: `useVolumeMix` is the single source of truth (master, music, per-person `{volume, muted}` keyed by `personMixKey`: the name, or `peer:<peerId>` for the duplicate-friendly "Anonymous"). One volume per person, applied the same whether they are talking or singing, and a mute that holds in both: the People-row popover and the stage cockpit slider edit that one number. Blobs written by the old two-slot model migrate on read, `talk` becoming `volume` and `stage` being dropped. It pushes gains into `src/lib/voiceMixer.ts`, which runs every remote voice through `source -> personGain -> masterBus -> duck -> limiter -> output`. Names resolve to `lkIdentity` from PartyKit status updates only at apply time, so volumes survive reconnects, and identities stay in the gain map after a participant drops off the roster because their LiveKit track can outlive the WebSocket. The mixer also owns each `<audio>` element's volume: 0 while the graph is audible, the full local mix when the AudioContext is suspended or Web Audio failed. All of it is local: no volume value is ever broadcast. Every gain decision (mute, clamping, master composition, the music bus) is `resolveGains` in `src/lib/volumeModel.ts`, which also owns `personMixKey`, the stored-blob parse/serialize and the tracked-identity LRU; the hook holds the React state and pushes the result.

## Adding a New PartyKit Message

1. Add the variant to `clientMessageSchema` / `serverMessageSchema` in `src/shared/protocol.ts` (nothing else declares it)
2. Handle in `party/index.ts` `onMessage` switch + add handler method
3. Handle in `src/hooks/useRoomState.ts` `onMessage` switch
4. Wire up in `RoomView.tsx`

## Styling

- **Tailwind CSS 4** + inline styles with CSS variables. No hardcoded colors.
- All colors via `var(--color-*)`: primary (violet `#8B5CF6`), accent (amber `#F59E0B`), dark theme surfaces, text hierarchy.
- **Icons**: `lucide-react` only. No emojis in UI - emojis only in chat messages and reaction bar.
- **Fonts**: Outfit (`var(--font-display)`) for headings/buttons, DM Sans (`var(--font-body)`) for body. Both via `next/font/google`.
- **Animations**: CSS keyframes in `globals.css` - `fade-in`, `slide-in`, `reaction-float`, `pulse-ring`.

## Atmosphere Layer

A third token layer on top of the primitives and the shadcn semantic layer. `src/lib/atmosphere.ts` registers fifteen typed `@property` custom properties (`--atmo-a/b/c`, `-glow`, `-tint`, `-accent`, `-accent-soft/-dim/-bright/-level`, `-strength`, `-pulse`, `-saturation`, `-warmth`, `-contrast`) so the between-song colour change cross-fades natively over 2s, declares the `AtmosphereProvider` interface and owns the only writer (`applyAtmosphere` on `document.documentElement`).

- **Surfaces consume the contract, never the inputs.** The room mesh (`.atmo-mesh`), the stage and video frame glow (`.atmo-frame`) and the panel glass (`.atmo-glass`, behind `SURFACE_PANEL`) reference the vars only.
- **Primary is atmosphere-driven, the rest of the semantic layer is not.** The whole `--color-primary` family (and shadcn's `--primary`/`--ring`, which Tailwind's `@theme inline` block makes the real source of `--color-primary`) resolves to `var(--atmo-accent*, <violet>)`, so the interactive accent follows the playing song's hue. Only the hue moves: `composeAtmosphere` pins each band to the idle violet's own oklch lightness (accent 0.606 < level 0.728 < soft 0.791 < bright 0.839, so the scale never inverts mid-song), takes that step's chroma as a ceiling and clamps it to the sRGB gamut for the hue with `srgbSafeChroma`, so the browser never gamut-maps a token and quietly moves its lightness. `avoidDangerHue` pushes any hue within 18deg of red back out, so contrast and meaning never ride on the thumbnail. Amber is host, red is attention, green is success, and those stay static. The violet fallbacks are also the `@property` initial values, so an idle room resolves to exactly today's violet tokens.
- **White-on-primary surfaces ramp off `--color-primary`, never off `-bright`.** The three white-text CTAs (`PlaybackControls` transport, `StageBanner` "Add to queue", `RoomView`'s audio unlock) are `linear-gradient(135deg, var(--color-primary), color-mix(in oklab, var(--color-primary) 78%, black))`, both stops in the accent's dark half, so white holds 3.6:1 or better at every hue instead of the 1.7:1 the `-bright` step would give. `-soft`, `-bright` and `-level` are for text and icons on dark panels only. Dark text on a tinted-white surface (QueuePanel's "Add to Queue") mixes 25% primary into black, so the label stays anchored while the background floats with the hue.
- **One provider today, structured for more.** `karaoke-theme` in localStorage selects it and is seeded with `auto` on first read, so a future picker is a new provider in `src/lib/atmosphereProviders.ts` plus a settings row.
- **The `auto` provider**: thumbnail hue (`atmospherePalette.ts`, hue-bucketed off a 32px canvas, cached per videoId) decides colour, genre (`atmosphereGenre.ts`, from `topicDetails` on the search route's existing `videos.list` call, plus a `?id=` lookup for pasted links) decides behaviour, and `composeAtmosphere` in `atmosphereAuto.ts` turns both into oklch tokens. Idle rooms hold `IDLE_TOKENS`, the Neon Pulse violet, accents included.
- **`--atmo-strength` is live and stays out of the cross-fade.** `AudioVisualizer` is the only writer: the singer's voice level drives it on a ~100ms tick through `setAtmosphereStrength`, under the 140ms opacity transition that smooths it, because the property is inherited and every write on the root costs a document-wide style recalc. Music energy is unmeasurable because YouTube audio never reaches the page, so the genre preset's `--atmo-pulse` is the tempo proxy. `prefers-reduced-motion` freezes the pulse and pins strength, and the colours still change.

## Component Conventions

- **Named exports only**: `export function ComponentName() {}` (not default exports)
- **Props interface above component**: `interface ComponentNameProps { ... }`
- **File naming**: PascalCase for components (`StageBanner.tsx`), camelCase for hooks/utils (`useLiveKit.ts`, `voiceEffects.ts`)
- **`"use client"` directive** at top of every component and hook file
- **Biome is linter-only** (`biome.jsonc`) - the formatter and the import assist are off on purpose, so no rule ever reformats a file. Rules that fight the existing style are disabled with a written reason in the config, and `suspicious/noConsole` is on with an override for `src/shared/log.ts` only. TypeScript strict mode (`noUncheckedIndexedAccess`) is still the primary gate.

## UI Patterns

- **Modal**: Backdrop (`fixed inset-0 z-40`, semi-transparent black, click to close) + centered card (`fixed left-1/2 top-1/2 z-50`). Always add Escape key handler via `useEffect`.
- **Error display**: Banner div with danger color, or inline text. Hooks return `error: string | null`.
- **Tabs**: Buttons with dynamic `borderBottom` color, content switching via state.
- **Volume sliders**: Shared `VolumeSlider` component (`.volume-slider` CSS class). Voice ranges are `0-200` with a detent at 100; music stays `0-100` because YouTube caps it.
- **Toggle buttons**: Show current state via icon/highlight, label describes the action.

## PWA and Service Worker

`public/sw.js` is an app-shell cache, registered from `ServiceWorkerRegistrar` (production builds only, so it never fights the dev server; in dev it unregisters any worker left over from a local production build and drops the `karaoke-shell-*` caches). It **must never cache API routes, PartyKit, LiveKit or YouTube**: it bails on every cross-origin request, on `/api/` and `/parties/`, and on a host denylist. Navigations are network-first with `/offline` as the fallback; hashed `_next/static` assets are cache-first.

Cache busting is automatic: `next.config.js` puts the commit SHA (or a build timestamp locally) in `NEXT_PUBLIC_SW_VERSION`, the client registers `/sw.js?v=<version>`, and the worker names its cache after that value, then `skipWaiting` + `clientsClaim` and deletes every older `karaoke-shell-*` cache on activate.

The room shows a reconnect banner whenever `useRoomState`'s `isConnected` is false. The join overlay covers the first connect, so that banner only ever means a socket that dropped mid-session.

## Environment

PartyKit-side: `REGISTRY_TOKEN` (required in production), `PARTY_ALLOWED_ORIGINS` (required in production, comma-separated browser origins allowed to call the HTTP endpoints; a deployed worker with it unset refuses every browser origin, exactly like `REGISTRY_TOKEN`, and local dev hostnames reflect without it), `FEATURE_FLAGS` (optional, comma-separated flag names that arrive in every `RoomState`), `PARTY_DEBUG` (optional, `1` or `true` opens the worker's `debug`/`info` logs; `warn`/`error` always reach the Cloudflare tail), plus the LiveKit, Upstash and YouTube vars below, because the token and search endpoints now run on the worker.

Required: `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL`, `NEXT_PUBLIC_LIVEKIT_URL`. Optional: `NEXT_PUBLIC_PARTY_HOST` (defaults to `localhost:1999`), `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` for key rotation and search caching, `LIVEKIT_API_KEY_N` for multi-key failover (auto-discovered up to `_20`), `YOUTUBE_API_KEY` for in-app YouTube search (Data API v3; without it the video input is paste-only; results are filtered to embeddable videos and cached 24h in Redis because search.list costs 100 of the 10k daily quota units), `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` for analytics (no key means the SDK is never loaded and every `track()` is a no-op; the host picks the EU or US region and defaults to US). See `docs/IDEOLOGY.md` for key rotation architecture and `docs/design/ANALYTICS.md` for the event taxonomy.

Path alias: `~/*` maps to `./src/*`. TypeScript strict mode with `noUncheckedIndexedAccess`.

## Deployment

- **Next.js**: Vercel (auto-deploy from GitHub on push to main)
- **PartyKit**: `npm run deploy:party` (separate deploy required after `party/` changes)
- **PartyKit secret**: `partykit env add REGISTRY_TOKEN` must be set on the deployed project. The registry party rejects every POST/DELETE from a non-local host when it is missing, so `/browse` goes empty instead of accepting forged listings.
- **PartyKit now also holds the backend secrets**: `partykit env add` each of `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL` (plus any `_N` variants), `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `YOUTUBE_API_KEY` and `PARTY_ALLOWED_ORIGINS`. Set all of them **before** the deploy, not after: `PARTY_ALLOWED_ORIGINS` is required in production the same way `REGISTRY_TOKEN` is, and the workflow's token health check fails the job (and skips the Vercel hook) when the LiveKit vars are missing rather than shipping a bundle whose only token source answers 500. Vercel keeps its copies while the legacy `/api` routes are still serving cached shells. `partykit dev` reads them straight out of `.env`, so local dev needs nothing extra.
- **The LiveKit key variant set on PartyKit must be byte-identical to Vercel's, gaps included.** `room:<code>:key` stores an *index* into the `LIVEKIT_API_KEY`, `_2` .. `_20` scan, so a variant present on one host and missing on the other shifts every later index and the two halves of one room get tokens for two different LiveKit projects. `room:<code>:keyfp` pins which key the index resolved to and a mismatch reassigns loudly (`[KeyRotation] Room mapping resolves to a different LiveKit key on this host`), but that is a detector, not a fix.
- **Branch protection**: main requires 1 approval, Vercel CI pass, all conversations resolved
- **PartyKit ships first, and the merge cannot choose otherwise.** `.github/workflows/deploy-partykit.yml` fires on every push to main touching `party/**`, `partykit.json` or `src/shared/**`, runs `npx partykit deploy`, health-checks `/parties/main/health-probe` (the `onRequest` GET) and then `/parties/token/HEALTH?room=HEALTH&name=healthcheck` (which fails on a worker missing its LiveKit secrets, where the room probe would pass), and only then POSTs the Vercel deploy hook, while Vercel's own git integration builds the same push in parallel. Nothing sequences those two, so the real order is PartyKit-first racing an independent Vercel build. That is what an additive protocol change wants anyway: old clients keep working during the gap. A change that needs Vercel-first needs a mechanism, not a rule: path-filter the workflow off that commit, or split it across two merges, client-side first and server-side second.
- **A protocol removal therefore has to be safe in either order.** Two bars. A stale cached client that still sends the removed variant fails `clientMessageSchema.safeParse` and gets the `Unknown message type` error reply, which `useRoomState` logs and otherwise ignores, so the socket stays up. And a removed `RoomState` field has to degrade on the already-deployed bundle instead of throwing: the client never validates server messages at runtime (`usePartySocket` casts the `JSON.parse` result), so the field simply arrives as `undefined` and the old code has to read that as a sane default. Removing `mutedBySinger` cleared both bars, with one side effect worth expecting rather than debugging: the deployed client reads `state.mutedBySinger ?? null`, so the moment the worker ships, every old client the singer had muted (mic on before the mute, not deafened) unmutes itself mid-song.
- `concurrency: partykit-deploy` with `cancel-in-progress: false` keeps two merges in quick succession from deploying out of order, and `.github/pull_request_template.md` makes the additive-protocol claim explicit on every PR.
- **`VERCEL_DEPLOY_HOOK_URL` secret** (optional, GitHub Actions): a Vercel deploy hook URL that chains a Vercel redeploy onto the tail of `deploy-partykit.yml`, after the health check passes. Create one under Vercel project settings > Git > Deploy Hooks and add it as a repo secret. When absent, the workflow logs a line and skips the trigger instead of failing.

## Skills and Workflows

Use these skills when working on this project:

### PR Workflow
1. Create feature branch from main
2. Implement + `npm run typecheck`
3. Push + create PR via `gh pr create`
4. Run `/babysit-pr <number>` to fix Copilot review comments
5. Loop with `/loop 5m /babysit-pr <number>` for continuous monitoring
6. Merge when clean (0 unresolved, CI passing)
7. Deploy PartyKit if `party/` changed: `npm run deploy:party`

### Key Skills
- **`/babysit-pr <N>`** - One-pass PR health check: fix CI, address review comments, re-request Copilot review. Use after every push.
- **`/code-review:code-review`** - Full 5-agent parallel code review (CLAUDE.md compliance, bug scan, history regression, previous PR comments, code comment compliance). Use before merging critical PRs.
- **`/brainstorming`** - Design features before building. Explores intent, requirements, alternatives. Use before any new feature.
- **`/loop <interval> <command>`** - Schedule recurring tasks (e.g., `/loop 5m /babysit-pr 9`). Auto-expires after 7 days.
- **`firecrawl`** - Web research for docs, pricing, best practices. Use `firecrawl search "query"` or `firecrawl scrape <url>`.

### Review Pattern
For major changes, run parallel review agents:
1. Bug scan (focus on logic errors, race conditions)
2. Regression check (compare with recent git history)
3. Protocol consistency (schema variant added in `src/shared/protocol.ts`, server handler and client `onMessage` case both present, `npm run test` green)
4. Audio path impact (verify startSinging/stopSinging untouched)
5. State/cleanup review (AudioContext closed, MediaStream stopped, timers cleared)

### Audit Pattern
For production readiness:
1. Check for dangling LiveKit rooms: `RoomServiceClient.listRooms()`
2. Check PartyKit health: `curl https://karaoke-room.elvistranhere.partykit.dev/parties/main/test`
3. Verify all AudioContexts closed on disconnect
4. Verify all setInterval/setTimeout cleared on unmount
5. Verify videoState cleared on room empty
