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
npm run build            # Production build
npm run deploy:party     # Deploy PartyKit server to Cloudflare
```

Vitest covers the pure models only (`src/lib/syncMath.ts`, `src/lib/volumeModel.ts`, `src/shared/protocol.ts`); there is no component or browser test layer. Verify changes with `npm run lint`, `npm run typecheck` and `npm run test`, plus `npm run build` when routing, config, or the service worker changed.

## Git

Do NOT include `Co-Authored-By` lines in commit messages.

## Writing

Never use em dashes (—). Use regular dashes (-) or rewrite the sentence.

## Architecture

**Karaoke Now** is a real-time karaoke room app. Three systems work together:

1. **PartyKit** (`party/`) — Cloudflare Durable Objects for room state (participants, queue, chat, mute-all). The server in `party/index.ts` is a state machine with heartbeat-based cleanup (15s ping, 40s evict, 60s singer timeout).

2. **LiveKit** - SFU for WebRTC audio transport. Voice only: the singer publishes their mic through the voice effect chain as one track. Music never crosses LiveKit.

3. **Next.js 15** (App Router) — UI + `/api/livekit-token` endpoint with multi-key rotation.

### Voice Pipeline (Critical Path)

The singer's audio pipeline in `useLiveKit.ts`:
```
getUserMedia (mic) → Voice Effect Chain → Mic GainNode
                                              ↓
                                  AudioContext.destination
                                              ↓
                                  publishTrack (LiveKit, Track.Source.Microphone)
```
`startSinging` runs automatically when the turn starts and `stopSinging` when it ends. Changes to `startSinging`/`stopSinging`/`cleanupMix` require careful review.

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

- **`useRoomState`** — PartyKit WebSocket, room state, chat, reactions, mute-all. Returns `send()` for raw messages.
- **`useLiveKit`** - LiveKit connection, mic toggle, singing voice pipeline, voice effects, mic check (live loopback). The most complex hook (~1000 lines).
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

## Patterns

- **Refs over state** for values accessed in callbacks/timeouts to avoid stale closures (`isMicEnabledRef`, `talkingNCRef`, `singingNCRef`, `voiceEffectRef`).
- **Hot-swap while singing**: NC toggle and voice effect changes re-capture the mic stream or rebuild the effect chain live without stopping the published track.
- **Mic check uses separate AudioContext**: Routes mic → effect chain → `ctx.destination` (speakers) for self-monitoring. Completely isolated from the singing mix path.
- **`mutedBySinger` is server-persisted**: Included in `RoomState` so reconnecting clients get the correct mute state. Cleared automatically in `promoteNextSinger()`.
- **`videoState` is server-owned**: Included in `RoomState` so late joiners catch up mid-song, and cleared at every site that clears `currentSingerId`. Only `currentSingerId` may send `video-load`/`video-sync`.
- **Room identity is persisted, the session is not**: `roomName`, `isPublic`, `passwordHash`, `adminClientId`, `adminVacatedAt` and `bannedClientIds` are write-through to `this.room.storage` and rehydrated in `onStart()`, so a DO restart or an empty-room moment keeps the room's identity. Chat, queue, participants and `videoState` stay in memory by design and are still cleared when the room empties. Because a password now outlives an empty room, there is no first-joiner exemption on `auth`. A kick ban outlives it too: there is no unban message, so a kick is permanent for that room code until the 200-entry LRU evicts it.
- **Admin succession never deadlocks**: a vacant seat with a known `adminClientId` belongs to the departed admin for `ADMIN_GRACE_MS`, but only the timer hands it on. `armAdminGrace()` is therefore called from `claimAdminOnJoin` as well as `startAdminGrace`, arming whatever is left of the window (`adminVacatedAt` is persisted for exactly this), because a room that emptied never armed a timer and a DO restart loses both the timer and `adminVacatedAt`.
- **Clock-authority stall detection**: the singer's `video-sync` stream is the room's playback heartbeat. `resetVideoStallTimer()` re-arms a 10s timer on every sync while `videoState.playing`; if it fires, the server pauses the room, broadcasts `video-state` and posts a system chat line. A rebuffering singer sends `video-sync` with `stalled: true`, which re-arms the timer without re-stamping a frozen position, so an ordinary rebuffer is not read as a dead device. The singer's page also broadcasts a pause on `visibilitychange` so a backgrounded phone hands the clock back immediately, and resumes when the page is visible again.
- **Feature flags are room-scoped**: `RoomState.flags` is seeded from the PartyKit `FEATURE_FLAGS` env var (comma-separated names, each set to `true`) and read on the client with `useFlag(roomState, name)`. Room-scoped rather than user-scoped, because one participant on a different sync path is a correctness bug, not an experiment.
- **Narrow props below RoomView**: no component under `RoomView` takes the LiveKit `Room`. `Toolbar` takes a `getMicLevel` callback, `StageBanner` takes a `getSingerLevel` callback, `AudioVisualizer` takes a `getSingerTrack` callback, and `useAutoSyncOffset` takes a stats provider. `RoomView` is where the transport is turned into those callbacks. The meters call `useAudioLevel` on the getter themselves, so a 75ms level tick re-renders one leaf instead of the whole room.
- **Per-person volume**: `useVolumeMix` is the single source of truth (master, music, per-person `{talk, stage, muted}` keyed by `personMixKey`: the name, or `peer:<peerId>` for the duplicate-friendly "Anonymous"). It pushes gains into `src/lib/voiceMixer.ts`, which runs every remote voice through `source -> personGain -> masterBus -> duck -> limiter -> output`. Names resolve to `lkIdentity` from PartyKit status updates only at apply time, so volumes survive reconnects, and identities stay in the gain map after a participant drops off the roster because their LiveKit track can outlive the WebSocket. The mixer also owns each `<audio>` element's volume: 0 while the graph is audible, the full local mix when the AudioContext is suspended or Web Audio failed. All of it is local: no volume value is ever broadcast. Every gain decision (talk vs stage, mute, clamping, master composition, the music bus) is `resolveGains` in `src/lib/volumeModel.ts`, which also owns `personMixKey`, the stored-blob parse/serialize and the tracked-identity LRU; the hook holds the React state and pushes the result.

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

## Component Conventions

- **Named exports only**: `export function ComponentName() {}` (not default exports)
- **Props interface above component**: `interface ComponentNameProps { ... }`
- **File naming**: PascalCase for components (`StageBanner.tsx`), camelCase for hooks/utils (`useLiveKit.ts`, `voiceEffects.ts`)
- **`"use client"` directive** at top of every component and hook file
- **Biome is linter-only** (`biome.jsonc`) - the formatter and the import assist are off on purpose, so no rule ever reformats a file. Rules that fight the existing style are disabled with a written reason in the config. TypeScript strict mode (`noUncheckedIndexedAccess`) is still the primary gate.

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

PartyKit-side: `REGISTRY_TOKEN` (required in production) and `FEATURE_FLAGS` (optional, comma-separated flag names that arrive in every `RoomState`).

Required: `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL`, `NEXT_PUBLIC_LIVEKIT_URL`. Optional: `NEXT_PUBLIC_PARTY_HOST` (defaults to `localhost:1999`), `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` for key rotation and search caching, `LIVEKIT_API_KEY_N` for multi-key failover (auto-discovered up to `_20`), `YOUTUBE_API_KEY` for in-app YouTube search (Data API v3; without it the video input is paste-only; results are filtered to embeddable videos and cached 24h in Redis because search.list costs 100 of the 10k daily quota units). See `docs/IDEOLOGY.md` for key rotation architecture.

Path alias: `~/*` maps to `./src/*`. TypeScript strict mode with `noUncheckedIndexedAccess`.

## Deployment

- **Next.js**: Vercel (auto-deploy from GitHub on push to main)
- **PartyKit**: `npm run deploy:party` (separate deploy required after `party/` changes)
- **PartyKit secret**: `partykit env add REGISTRY_TOKEN` must be set on the deployed project. The registry party rejects every POST/DELETE from a non-local host when it is missing, so `/browse` goes empty instead of accepting forged listings.
- **Branch protection**: main requires 1 approval, Vercel CI pass, all conversations resolved
- Deploy PartyKit before Vercel: the protocol is additive, so old clients keep working during the gap. `.github/workflows/deploy-partykit.yml` carries `concurrency: partykit-deploy` with `cancel-in-progress: false`, so two merges in quick succession cannot deploy out of order, and `.github/pull_request_template.md` makes the additive-protocol claim explicit on every PR.

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
5. Verify mutedBySinger/videoState cleared on room empty
