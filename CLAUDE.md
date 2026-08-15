# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev:all          # Next.js (3000) + PartyKit (1999) — use this for local dev
npm run dev              # Next.js only
npm run dev:party        # PartyKit only
npm run typecheck        # tsc --noEmit
npm run build            # Production build
npm run deploy:party     # Deploy PartyKit server to Cloudflare
```

No test framework is configured. Verify changes with `npm run typecheck`.

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

### Type Synchronization

`party/types.ts` and `src/types/room.ts` **must be kept in sync manually**. Every message type, field addition, or RoomState change needs updating in both files. The PartyKit server imports from `party/types.ts`; the client imports from `src/types/room.ts`.

## Key Hooks

- **`useRoomState`** — PartyKit WebSocket, room state, chat, reactions, mute-all. Returns `send()` for raw messages.
- **`useLiveKit`** - LiveKit connection, mic toggle, singing voice pipeline, voice effects, mic check (live loopback). The most complex hook (~1000 lines).
- **`useYouTubePlayer`** - Injects the IFrame API once (module-level singleton promise) and owns the `YT.Player` instance behind a ref-stable handle.
- **`useVideoSync`** - Drift correction loop plus the singer's 2s broadcast.
- **`usePartyClock`** - `time-sync` sampler, returns `serverOffsetRef` (median of min-RTT samples).
- **`useAudioDevices`** — Device enumeration, mic mode (`"voice"` = NC on, `"raw"` = NC off).
- **`usePartySocket`** — Low-level PartyKit WebSocket wrapper with auto-reconnect.

## Voice Effects

`src/lib/voiceEffects.ts` — Pure Web Audio API, zero dependencies. Each effect returns `{ input, output, cleanup, setWetDry }`. Effects: Hall (feedback delay network), Echo (delay + feedback), Warm/Bright (BiquadFilter EQ), Chorus (LFO-modulated delay).

## Patterns

- **Refs over state** for values accessed in callbacks/timeouts to avoid stale closures (`isMicEnabledRef`, `talkingNCRef`, `singingNCRef`, `voiceEffectRef`).
- **Hot-swap while singing**: NC toggle and voice effect changes re-capture the mic stream or rebuild the effect chain live without stopping the published track.
- **Mic check uses separate AudioContext**: Routes mic → effect chain → `ctx.destination` (speakers) for self-monitoring. Completely isolated from the singing mix path.
- **`mutedBySinger` is server-persisted**: Included in `RoomState` so reconnecting clients get the correct mute state. Cleared automatically in `promoteNextSinger()`.
- **`videoState` is server-owned**: Included in `RoomState` so late joiners catch up mid-song, and cleared at every site that clears `currentSingerId`. Only `currentSingerId` may send `video-load`/`video-sync`.
- **Per-person volume**: `useVolumeMix` is the single source of truth (master, music, per-person `{talk, stage, muted}` keyed by `personMixKey`: the name, or `peer:<peerId>` for the duplicate-friendly "Anonymous"). It pushes gains into `src/lib/voiceMixer.ts`, which runs every remote voice through `source -> personGain -> masterBus -> duck -> limiter -> output`. Names resolve to `lkIdentity` from PartyKit status updates only at apply time, so volumes survive reconnects, and identities stay in the gain map after a participant drops off the roster because their LiveKit track can outlive the WebSocket. The mixer also owns each `<audio>` element's volume: 0 while the graph is audible, the full local mix when the AudioContext is suspended or Web Audio failed. All of it is local: no volume value is ever broadcast.

## Adding a New PartyKit Message

1. Add to `ClientMessage` / `ServerMessage` in **both** `party/types.ts` and `src/types/room.ts`
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
- **No ESLint or Prettier** - TypeScript strict mode (`noUncheckedIndexedAccess`) is the only gate

## UI Patterns

- **Modal**: Backdrop (`fixed inset-0 z-40`, semi-transparent black, click to close) + centered card (`fixed left-1/2 top-1/2 z-50`). Always add Escape key handler via `useEffect`.
- **Error display**: Banner div with danger color, or inline text. Hooks return `error: string | null`.
- **Tabs**: Buttons with dynamic `borderBottom` color, content switching via state.
- **Volume sliders**: Shared `VolumeSlider` component (`.volume-slider` CSS class). Voice ranges are `0-200` with a detent at 100; music stays `0-100` because YouTube caps it.
- **Toggle buttons**: Show current state via icon/highlight, label describes the action.

## Environment

Required: `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL`, `NEXT_PUBLIC_LIVEKIT_URL`. Optional: `NEXT_PUBLIC_PARTY_HOST` (defaults to `localhost:1999`), `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` for key rotation and search caching, `LIVEKIT_API_KEY_N` for multi-key failover (auto-discovered up to `_20`), `YOUTUBE_API_KEY` for in-app YouTube search (Data API v3; without it the video input is paste-only; results are filtered to embeddable videos and cached 24h in Redis because search.list costs 100 of the 10k daily quota units). See `docs/IDEOLOGY.md` for key rotation architecture.

Path alias: `~/*` maps to `./src/*`. TypeScript strict mode with `noUncheckedIndexedAccess`.

## Deployment

- **Next.js**: Vercel (auto-deploy from GitHub on push to main)
- **PartyKit**: `npm run deploy:party` (separate deploy required after `party/` changes)
- **PartyKit secret**: `partykit env add REGISTRY_TOKEN` must be set on the deployed project. The registry party rejects every POST/DELETE from a non-local host when it is missing, so `/browse` goes empty instead of accepting forged listings.
- **Branch protection**: main requires 1 approval, Vercel CI pass, all conversations resolved
- Deploy PartyKit before Vercel: the video protocol is additive, so old clients keep working during the gap.

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
3. Protocol consistency (types in sync, handlers complete)
4. Audio path impact (verify startSinging/stopSinging untouched)
5. State/cleanup review (AudioContext closed, MediaStream stopped, timers cleared)

### Audit Pattern
For production readiness:
1. Check for dangling LiveKit rooms: `RoomServiceClient.listRooms()`
2. Check PartyKit health: `curl https://karaoke-room.elvistranhere.partykit.dev/parties/main/test`
3. Verify all AudioContexts closed on disconnect
4. Verify all setInterval/setTimeout cleared on unmount
5. Verify mutedBySinger/videoState cleared on room empty
