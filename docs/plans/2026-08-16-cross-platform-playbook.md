# Karaoke Now: Platform, Architecture, and Delivery Playbook

Written against the codebase as of `9b5fce2`, for a 3-person team (infra owner, UX engineer, one more), no dedicated native-mobile engineer.

---

## 0. Where you actually are

Two corrections before the roadmap, because they change the sequencing.

**You have not shipped a PWA yet.** `/Users/elvistranhere/Workspaces/karaoke-now/src/app/manifest.ts` plus icons plus `appleWebApp` metadata makes the app *installable*. There is no service worker anywhere in `src/` or `public/`. That means: no offline shell, no background anything, and critically **no push notifications on iOS at all**, since iOS requires both home-screen install and a service worker registering `showNotification` ([iOS PWA limitations](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)). Half of the argument for moving to Capacitor is "PWAs can't do push on iOS," but you haven't tested the ceiling you're trying to escape. Fix that first; it is a week of work and it is also the exact evidence Apple's reviewers look for.

**Your riskiest coupling is not native, it's the singer-as-clock-authority design.** Per your own architecture notes, the singer's client broadcasts `video-sync` every 2s and every other client nudges playback rate toward it. Every platform risk below (backgrounded WKWebView muting the mic, WebView suspending timers, screen lock) is therefore not a *singer-only* failure. A singer whose phone locks freezes or desyncs the entire room. That single fact should reorder your priorities: room-level resilience to a stalled clock authority is worth more than any platform migration, and it's a two-day change to `/Users/elvistranhere/Workspaces/karaoke-now/party/index.ts`.

---

## 1. Platform roadmap

### Verdict

**Finish the PWA → Capacitor for Android first, iOS conditional on two spikes → do not plan for React Native.**

The industry ladder (default PWA, escalate to Capacitor for store distribution or a specific native API, reserve full native for when platform integration *is* the product) matches your trajectory ([PWA vs Capacitor vs Native 2026](https://ourcodeworld.com/articles/read/3646/pwa-vs-capacitor-vs-native-2026)). Capacitor is also the correct default for a web-only team: you keep the entire Next.js stack, you need fewer device-specific patches, and you aren't committing three people to maintaining a second UI codebase ([React Native vs Capacitor](https://www.bretcameron.com/blog/react-native-vs-capacitor-why-i-use-both)). Kotlin Multiplatform is out on headcount alone: it shares business logic but keeps fully native per-platform UI, so it only pays off once you already employ iOS and Android UI engineers ([KMP vs Flutter vs RN 2026](https://www.javacodegeeks.com/2026/02/kotlin-multiplatform-vs-flutter-vs-react-native-the-2026-cross-platform-reality.html)).

### Two spikes that can kill the iOS Capacitor build. Run them before writing any shell code.

**Spike A: YouTube IFrame inside WKWebView.** Your entire music path is the YouTube IFrame API, one player per client, with playback-rate nudging. iOS WKWebView does not send the same `Referer` headers Safari does, and YouTube's embed validation rejects it with Error 153. The known workaround is serving a proxy HTML page from your own domain to carry the referrer, plus setting `allowsInlineMediaPlayback = true` at the native WKWebView config layer (not just `playsinline=1` in HTML) or iOS forces fullscreen and ignores autoplay ([Error 153 in iOS Capacitor](https://medium.com/@davidvesely.cz/fixing-youtube-error-153-in-ios-capacitor-apps-a-simple-proxy-solution-5807d3df83d5)). Fullscreen-forcing alone would break `VideoStage`'s transparent blocker and `inert` container, which is a hard product constraint in your design doc ("no user may touch the YouTube surface"). **Timebox: 2 days. Success criterion: video loads, `getAvailablePlaybackRates()` returns fractional rates, and the blocker overlay still suppresses touch.**

**Spike B: background mic and background timers.** There is a longstanding open WebKit bug where WKWebView's `microphoneCaptureState` goes to muted shortly after `applicationDidEnterBackground`, confirmed to reproduce on real Capacitor apps ([WebKit bug 241480](https://bugs.webkit.org/show_bug.cgi?id=241480), [Apple forums thread](https://developer.apple.com/forums/thread/774239)). Web Audio suspends too. No Capacitor plugin fully patches this; it is a runtime-level restriction. **Timebox: 2 days. Test the singer case specifically: start singing, background the app, confirm whether the LiveKit published track goes silent and whether `useVideoSync`'s 300ms interval keeps firing.** Assume the answer is bad and design around it (see §3).

### Why Android first

Android WebView plus a foreground service is a solved problem: long-running mic work runs in a foreground service with an ongoing notification, and WebRTC calling now requires `FOREGROUND_SERVICE_TYPE_PHONE_CALL` rather than `TYPE_MICROPHONE` ([Capawesome foreground service](https://capawesome.io/plugins/android-foreground-service/)). iOS is the platform where the ceiling is real. Shipping Android to an internal track first gets you the whole Capacitor pipeline (signing, CI, plugin wiring, OTA) proven on the platform that will actually work, without gambling the whole effort on Spike A and B.

### Apple Guideline 4.2 is passable, and cheaply

Rejection language is "not sufficiently different from a web browsing experience." The bar is demonstrable native value, not a rewrite: push notifications, native navigation chrome, biometrics, haptics, deep linking, and graceful offline handling. Vendors publishing thousands of WebView apps report 97-100% approval once they force native plugin integration into every submission ([Median.co](https://median.co/blog/will-apple-approve-my-webview-app)). For you the natural set is: push ("your turn is next," which is a real product feature you don't have), haptics on reaction/turn events, deep links to `/room/[code]`, and an offline screen instead of a white WebView. Budget these as *product* work, not compliance work; they're all things a karaoke app wants anyway.

### React Native: do not plan for it

The "Capacitor now, RN later" framing is common but wrong for this app, for two codebase-specific reasons.

1. **RN would cost you the volume mixer.** `/Users/elvistranhere/Workspaces/karaoke-now/src/lib/voiceMixer.ts` runs every remote voice through `source → personGain → masterBus → duck → limiter → output`, built from `MediaStreamAudioSourceNode` on LiveKit remote tracks. That is the standard, documented way to do it on web ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamAudioSourceNode)) and there is no RN equivalent: LiveKit's RN tracks don't expose a `MediaStream` the way browser WebRTC does. `react-native-audio-api` brings Web-Audio-shaped code to AVAudioEngine/Oboe ([docs](https://docs.swmansion.com/react-native-audio-api/)) but it is unconfirmed whether it can consume a LiveKit RN remote track as a source node. Your Discord-style per-person talk/stage mixer, which you shipped three commits ago and which is your most distinctive feature, would be the first casualty.

2. **RN does not remove the WebView.** There is no native YouTube IFrame; RN's YouTube libraries are WebView wrappers. You'd carry a WebView inside RN for the music path and inherit the same rate-nudging and referrer problems, while paying for a second codebase.

The honest reframe: RN's only real win here is the LiveKit RN SDK's native audio session integration (CallKit, background mic, echo cancellation tuning), which exists because there is no first-party LiveKit Capacitor plugin ([LiveKit RN platform docs](https://docs.livekit.io/transport/sdk-platforms/react-native/)). That win is bounded to background iOS singing. **Write down the trigger condition instead of the plan: "if iOS background singing becomes a top-3 user complaint after 3 months of native distribution, spike LiveKit RN + react-native-audio-api for 2 weeks."** Also note RN's New Architecture became the sole default in 2025 and governance moved to the Linux Foundation, which lowers the platform risk of deferring ([Expo audio + native code](https://expo.dev/blog/real-time-audio-processing-with-expo-and-native-code)), but real-time audio is explicitly the roughest interop surface, so a spike is mandatory before commitment.

Oura is the cautionary tale everyone cites, but their driver was deep BLE/sensor integration and health-data reliability, not UI performance ([the journey away from React Native](https://zoewave.medium.com/the-journey-away-from-react-native-adfa65448c07)). Your analog is only the background-mic path, not the app.

---

## 2. Target architecture to start moving toward now

The goal is not "be ready for RN." It is: **make the platform-dependent surface small and named, so any future split is a swap of 4 files rather than a rewrite of 1,300-line hooks.** Everything below pays for itself on web immediately.

### What belongs in a platform-agnostic core

Three things in your codebase are pure logic wearing a React costume.

**1. The protocol.** `/Users/elvistranhere/Workspaces/karaoke-now/party/types.ts` and `/Users/elvistranhere/Workspaces/karaoke-now/src/types/room.ts` differ only by comment text and arrow glyphs. CLAUDE.md carries a manual-sync rule and a 4-step checklist for adding a message. That rule is a bug generator: a missed field in one file typechecks fine on both sides and fails at runtime in a live room.

Replace both with one package of Zod schemas, types inferred from them, imported by the Durable Object and every client. PartyKit's own docs recommend validating every client-sent message against a schema ([validating client inputs](https://docs.partykit.io/guides/validating-client-inputs/)), and you already ship Zod. This deletes a CLAUDE.md rule, adds runtime validation the server currently lacks for most messages, and is the single highest-value/lowest-risk change in this document. When a native client arrives it imports the same package with zero codegen.

**2. The sync engine.** The drift math is spread across `/Users/elvistranhere/Workspaces/karaoke-now/src/hooks/useVideoSync.ts` (221 lines), `usePartyClock.ts` (median of min-RTT samples), and `useAutoSyncOffset.ts` (EMA over jitter buffer + half RTT). This is the most correctness-critical and least testable code you own, and it has zero tests because it's trapped inside effects and refs.

Extract pure functions with no player, no DOM, no React:

```
computeTarget(videoTime, wallTime, serverNow, offsetSec) -> number
chooseCorrection(drift) -> { kind: "hold" | "rate" | "seek", value: number }
estimateOffset(samples) -> number
```

The 300ms interval and the ref plumbing stay in the hook; the thresholds (0.05s / 1.5s, rate clamp 0.95-1.05) become tested constants. Your design already implements the industry pattern of host-driven position broadcast plus a deliberate target-delay buffer in the 100-300ms range ([WebRTC latency and synchronisation](https://getstream.io/resources/projects/webrtc/fundamentals/latency-jitter-synchronisation/)), so this is codifying a validated design, not redesigning it.

**3. The volume model.** `/Users/elvistranhere/Workspaces/karaoke-now/src/hooks/useVolumeMix.ts` holds the rules that make your mixer coherent: `personMixKey` derivation, the talk-vs-stage *switch* (never multiply), master × person with exactly two layers, `music = musicSlider × min(master, 1)`, clamping where non-finite falls back to unity, storage migration for legacy anonymous keys. Every one of those is a pure function of `(storedState, roster, currentSingerId)` returning `Record<identity, number>`. Extract it. The hook becomes a thin `useSyncExternalStore`-shaped wrapper. `voiceMixer.ts` stays where it is; it's already correctly shaped as a factory returning an interface, which makes it an *adapter*, not core.

### Ports and adapters, applied at your seams

The pattern in React is: business logic lives outside the component tree behind an interface (the port), a concrete implementation is the adapter, and custom hooks are the only seam components see ([hexagonal-inspired architecture in React](https://alexkondov.com/hexagonal-inspired-architecture-in-react/)). Your five ports:

| Port | Today's adapter | What a platform swap would replace |
|---|---|---|
| `RoomTransport` | `usePartySocket` / PartySocket | Nothing; PartySocket runs on RN |
| `VoiceTransport` | `useLiveKit` / livekit-client | `@livekit/react-native` |
| `MediaPlayer` | `useYouTubePlayer` / YT IFrame | Native player or in-RN WebView |
| `VoiceOutput` | `voiceMixer.ts` | `react-native-audio-api` or native module |
| `Clock` | `usePartyClock` | Nothing |

**The concrete leak to fix this month:** `livekit-client`'s `Room` object is imported directly by `/Users/elvistranhere/Workspaces/karaoke-now/src/components/room/AudioVisualizer.tsx`, `Toolbar.tsx`, `StageBanner.tsx`, and `src/hooks/useAutoSyncOffset.ts`. Four files where a vendor SDK type has reached the UI layer. Components should receive `{ levels: number[], isPublishing: boolean }`, not a `Room`. Fixing this is a couple of hours and it removes the largest single obstacle to ever running your UI anywhere else.

**The second thing to fix:** `useLiveKit.ts` is 1,326 lines and CLAUDE.md flags it as requiring careful review on every change. It mixes five responsibilities: connection lifecycle, the capture graph (`getUserMedia` → effect chain → gain → publish), voice effect hot-swapping, mic-check loopback with its own AudioContext, and device management. Split it by responsibility, not by platform. Only the connection lifecycle is LiveKit-specific; the rest is Web Audio and would port to a native audio graph on its own terms. You get a reviewable file today and portability for free.

### Minimal monorepo shape

pnpm workspaces plus Turborepo is right for you. Nx only earns its configuration surface past roughly 20 packages combined with a need for codegen, polyglot builds, or distributed CI, none of which apply ([monorepo decision matrix 2026](https://www.digitalapplied.com/blog/monorepo-strategy-2026-turborepo-nx-decision-matrix)). Stop at four:

```
apps/web        Next.js 15
apps/party      PartyKit worker (currently party/)
packages/protocol   Zod message schemas + inferred RoomState types
packages/core       sync math, volume model, port interfaces (no React, no DOM)
```

**Sequencing caution:** do not start with the workspace. Start with `shared/protocol/` and `shared/core/` as plain directories referenced by both tsconfig path aliases (you already have `~/*` → `./src/*`). Verify PartyKit's bundler resolves them cleanly before you introduce pnpm workspace protocol links, because `npx partykit deploy` bundling of workspace dependencies is the kind of thing that eats a day. Promote to a real workspace only once both packages exist and the boundary has held for a few weeks.

### Capacitor prep: collapse two backends into one

Capacitor needs a static bundle, which means `output: 'export'` and the loss of route handlers and server actions from the wrapped app ([Next.js + Capacitor](https://capgo.app/blog/building-a-native-mobile-app-with-nextjs-and-capacitor/)). You have three server surfaces: `/api/livekit-token`, `/api/youtube-search`, and `/api/trpc`.

The usual advice is "extract them into a separate deployable." Your version is better: **move them onto the PartyKit Cloudflare Worker you already own.** Every client already holds an open connection there, `/browse` already talks to the registry party directly from the client via `NEXT_PUBLIC_PARTY_HOST`, and your Upstash-backed key rotation is REST-based so it runs on Workers unchanged. That collapses your backend count from two to one, makes the Next.js app genuinely static (faster, cheaper, CDN-only), and largely dissolves the deploy-ordering constraint in §4. Two things to verify before committing: `livekit-server-sdk`'s `AccessToken` signing under the Workers runtime, and whether tRPC is worth keeping at all given `roomRouter` contains only `generateCode` and `validateCode`, which are 15 lines of pure function that don't need a server.

While you're there: `/api/livekit-token` is an unauthenticated GET that mints a room token for any valid-format code. That's tolerable behind same-origin on the web; exposing it cross-origin for a `capacitor://localhost` shell widens it. Add an origin allowlist and a rate limit as part of the move, not after.

On tRPC generally: it stays fine for TS-to-TS, including a future RN client, but it should not be the boundary for anything you'd want a non-TS consumer to call ([tRPC vs GraphQL vs REST 2026](https://apiscout.dev/guides/trpc-vs-graphql-vs-rest-2026)). Given how thin your router is, the cheapest answer is to delete it.

---

## 3. Realtime audio guidance

### The capture-side seam is the one worth building now

LiveKit exposes the same conceptual hook on every platform: a capture post-processor attached to the local audio track before publish. On web it's `localAudioTrack.setProcessor()`, on iOS `AudioManager.shared.capturePostProcessingDelegate`, on Android `AudioProcessorOptions(capturePostProcessor = ...)`. This is the same mechanism LiveKit ships Krisp through ([noise cancellation docs](https://docs.livekit.io/transport/media/noise-cancellation/)).

Your `/Users/elvistranhere/Workspaces/karaoke-now/src/lib/voiceEffects.ts` already returns `{ input, output, cleanup, setWetDry }`, which is one adapter away from LiveKit's `TrackProcessor` shape. **Conform it to `TrackProcessor` now, on web.** It costs a small wrapper, it simplifies `startSinging` (the effect chain stops being manually spliced between `getUserMedia` and `publishTrack`), and it means the Hall/Echo/Warm/Bright/Chorus effects have a defined home on any native platform later.

Be clear-eyed about the asymmetry: **capture-side effects port, playback-side per-person mixing does not.** Hall reverb on the singer's voice has a native path. Your talk/stage per-person gain graph does not. Weight future platform decisions accordingly.

### Background audio: design around the ceiling, don't fight it

iOS Safari and WKWebView suspend WebRTC and Web Audio on background and screen lock. The mic gets muted by the OS, lock-screen PWA audio dies after roughly 30 seconds, and the open Apple Developer Forums request for background WebRTC is unresolved ([thread 774239](https://developer.apple.com/forums/thread/774239), [thread 121822](https://developer.apple.com/forums/thread/121822)). Capacitor plugins do not route around this.

**Do not promise background singing on iOS.** Design for the failure instead, and do it on web now, before Capacitor:

1. **Wake Lock in the room view.** `navigator.wakeLock` works on iOS Safari 16.4+ and is the single highest-value line of code in this section. Request it when the user is in a room, release on leave. This prevents most of the failure mode by preventing the screen from locking at all.
2. **Server-side clock-authority stall detection.** In `party/index.ts`, if `video-sync` from the current singer stops arriving for ~5 seconds while `videoState.playing` is true, pause the room and broadcast it. You already suspend the 60s idle timer while `videoState.playing` is true; this is the missing complement. Without it, a backgrounded singer leaves the room drifting silently. **This is a live bug on web today**, reproducible by backgrounding a Safari tab, and it is independent of any native work.
3. **Singer-side `visibilitychange` handling.** When the singer's page hides, broadcast a pause immediately rather than waiting for the server to notice.
4. **Honest UX copy.** A "keep this screen on while singing" hint beats a mysterious dead room.

If and when you do go Capacitor, the native config work you own regardless of plugin choice: iOS `UIBackgroundModes: audio` in Info.plist plus correct `AVAudioSession` category management (mis-sequenced deactivation throws `CoreMediaErrorDomain -16042` and kills all subsequent playback), and Android a foreground service with `FOREGROUND_SERVICE_TYPE_PHONE_CALL` ([Capgo AudioSession](https://capgo.app/plugins/capacitor-audiosession/)). Plugins abstract the API, not the decisions.

One useful reassurance: Web Audio itself works normally inside a Capacitor WebView on both platforms. Your mixer and effects graph need no porting for a Capacitor release. Only OS-owned concerns need the bridge, and bridge calls are expensive enough that anything UI-rate should be throttled to 60-100ms rather than called per frame ([Capacitor native bridge](https://capgo.app/blog/implementing-native-bridge-for-ios-in-capacitor/)). Keep the audio hot path entirely inside JS.

### Testing: three layers, and only two of them are automatable

There is no good automated oracle for perceptual audio quality; even WebRTC testing specialists treat it as a separate manual track ([WebRTC testing with Selenium](https://antmedia.io/webrtc-testing-with-selenium/)). Your repo has no test framework at all, and `npm run typecheck` as the only gate. The pragmatic layering:

1. **Unit tests (Vitest) on the extracted pure logic.** Drift correction decisions, offset estimation, volume resolution, `personMixKey`, storage migration, protocol schema round-trips. Zero infrastructure, runs in a second, and covers the code most likely to break a live room. This is the reason to do the §2 extraction first: it is what makes testing possible at all.
2. **Playwright E2E with fake media devices** (`--use-fake-device-for-media-stream`). Launch two clients into one room, assert on LiveKit connection state, participant and track counts, and `getStats()` values for packet loss and jitter. Your `webapp-testing` skill already has the Playwright toolkit. The highest-value E2E is specifically the two-client sync case: client A loads a video, client B joins mid-song, assert B seeks once and then converges.
3. **Manual, pre-release, on real devices.** Actual audio quality, echo behavior, cross-device latency. Keep a written checklist; don't try to automate it.

---

## 4. Delivery process

### Branching

Stay trunk-based with short-lived, single-author branches. You already have main protected with 1 approval, Vercel CI, and resolved-conversations, plus the `/babysit-pr` loop. That's a good setup for 3 people and DORA research backs short-lived branches on trunk as the high-performer marker ([trunk-based development](https://trunkbaseddevelopment.com/)). Don't add release branches; you have no versioned milestones on web.

The prerequisite for trunk-based development is feature flags, which you have zero of. That's the gap.

### Feature flags: build them into RoomState, don't buy a service

The standard advice is Flipt/Unleash/GrowthBook/PostHog ([OSS LaunchDarkly alternatives](https://www.growthbook.io/insights/open-source-alternatives-to-launchdarkly)). For you that's the wrong shape, for a specific reason: **your flags need to be room-scoped, not user-scoped.** A per-user flag in a multiplayer room means one participant gets the new sync algorithm and the others don't, which for a synchronized-playback app is a correctness bug, not an experiment.

You already broadcast a server-owned `RoomState` from a Durable Object to every client in a room. Add `features: Record<string, boolean>`, defaulted from PartyKit env vars, overridable per room by an admin for dogfooding. An afternoon of work, exactly matched to your topology, no vendor, and it composes with the admin lifecycle you just shipped. Revisit PostHog's free tier only if you want product analytics and session replay anyway, in which case flags come along for free.

### The PartyKit-before-Vercel constraint

Your CLAUDE.md rule is "deploy PartyKit before Vercel; the protocol is additive so old clients keep working during the gap." **That ordering is not actually enforced.** `.github/workflows/deploy-partykit.yml` fires on push to `main` filtered to `party/**` and `partykit.json`, and Vercel's git integration fires on the same push. They run concurrently. PartyKit usually wins because it deploys faster than a Next.js build, but that's luck, not ordering. Worse, a PR touching both `src/` and `party/` starts both at the same instant.

Three fixes, in increasing order of commitment:

1. **Today, free:** add `concurrency: { group: partykit-deploy, cancel-in-progress: false }` to the workflow so two merges in quick succession cannot deploy out of order. Add a PR-template checkbox: "protocol change is additive (new optional fields / new message types only)."
2. **When the additive discipline stops holding:** disable Vercel's automatic git deploys, and have the PartyKit workflow deploy the worker, wait for a health check against `/parties/main/health`, then fire a Vercel deploy hook. Real ordering, ~20 lines of YAML. Do this the first time you want a breaking protocol change, or the moment `packages/protocol` makes breaking changes feel safe (it will, and that's the trap: a shared schema package makes it *easier* to change both sides at once and forget the deploy gap).
3. **Best, and it makes the problem mostly vanish:** the §2 backend consolidation. If the API routes move to the Worker and the Next.js app becomes a static CDN bundle, the ordering question collapses to "deploy the worker, then push the static bundle," which is naturally ordered because static assets are backward-compatible with an already-updated server.

Separately, Cloudflare Workers now supports gradual deployments with per-version analytics and **Version Affinity**, which pins a session to one version so a live karaoke room doesn't flip mid-song ([Workers production safety](https://blog.cloudflare.com/workers-production-safety/)). That is precisely tuned to your highest-risk deploy surface: changing Durable Object room-state logic while people are singing. Whether PartyKit's deploy path exposes this is worth 30 minutes of investigation; if it does, use it for every `party/index.ts` state-machine change.

### Release cadence once a store binary exists

Keep web on continuous deploy. Add a **weekly train for the native shell only**: whatever is flag-ready on Thursday goes into that week's binary, everything else waits. Release trains become worth it exactly when you add a store-gated platform, because the store binary needs a predictable cutoff distinct from continuous web deploys ([feature-based vs release train](https://www.runway.team/blog/mobile-releases-feature-based-or-release-train)).

The versioning problem (web ships daily, stores review in 24-48h, longer around WWDC and holiday freezes) has a named scheme, PaceVer's `NATIVE.OTA` format ([pacever.org](https://pacever.org/)). **Don't adopt it.** Its real-world adoption is unverified and the underlying idea is one sentence: bump the native number only when a new binary goes through review, bump the OTA number on every web-side release. Implement that idea directly, embed the web build SHA in the bundle, and show both in your settings drawer so a bug report tells you which pair you're debugging. Reserve genuine native-binary bumps for Capacitor plugin, permission, and native shell changes; everything else, which with Capacitor is nearly your whole UI, ships over the air ([skipping app review for JS updates](https://www.cloudbees.com/blog/skip-app-review-update-apps-instantly-2)).

### CI for the native build

GitHub Actions driving Fastlane (`match` for signing, TestFlight and Play internal track for distribution) is the standard ([mobile CI/CD blueprint](https://developersvoice.com/blog/mobile/mobile-cicd-blueprint/)). With one infra owner already carrying LiveKit key rotation, Durable Objects, and four health-check workflows, **use a managed build service rather than self-hosting macOS runners and certificate management.** Certificate expiry at 11pm is not a good use of your only infra person.

### Ownership: no platform silos

With three people, any strict platform split means every surface has exactly one person who can debug it ([software silos](https://spin.atomicobject.com/software-silos/)). Your surfaces are already tightly coupled anyway: the sync engine spans PartyKit (infra) and the player and volume UI (UX).

One concrete rule: **the Capacitor spike and the native shell should be owned by someone other than the infra owner.** If the person who owns Durable Objects, LiveKit, and key rotation also owns the native shell, you've created a single point of failure across your entire stack. Let the infra owner stay the depth specialist on PartyKit and LiveKit, and let the native shell start life with a second reader.

---

## 5. Prioritized 90-day list

Ordered by value per day of work. Items 1-5 are worth doing whether or not you ever ship native.

### Days 1-30: de-risk, extract, prove

1. **Server-side clock-authority stall detection** in `party/index.ts`: no `video-sync` for ~5s while `videoState.playing` → pause and broadcast. Plus singer-side `visibilitychange` → immediate pause broadcast. *Fixes a live web bug. 1-2 days.*
2. **Wake Lock in the room view.** *Half a day, removes most of the background-audio failure mode by preventing it.*
3. **Spike A (YouTube in WKWebView) and Spike B (background mic and timers).** Bare Capacitor shell, no product work. *4 days total, timeboxed. These two results decide the iOS half of your roadmap; run them before anyone writes shell code.*
4. **Extract `shared/protocol`** as Zod schemas, delete `party/types.ts` / `src/types/room.ts` duplication and the manual-sync rule from CLAUDE.md. Add server-side validation of inbound messages. *2-3 days, removes a whole class of runtime bug.*
5. **Stop passing `Room` into components** (`AudioVisualizer.tsx`, `Toolbar.tsx`, `StageBanner.tsx`, `useAutoSyncOffset.ts`). *A few hours.*
6. **Extract the sync math into pure functions, add Vitest, write the first tests in the repo.** Drift thresholds, rate clamp, offset estimation. *2-3 days.*

### Days 31-60: make the seams real

7. **Extract the volume model** out of `useVolumeMix.ts` into pure `resolveGains(...)`; test talk/stage switching, clamping, legacy-key migration. *2 days.*
8. **Split `useLiveKit.ts`** into connection lifecycle, capture graph, effects, mic check, devices. Conform `voiceEffects.ts` to LiveKit's `TrackProcessor` interface while you're in there. *4-5 days, and it makes your scariest file reviewable.*
9. **Move `/api/livekit-token` and `/api/youtube-search` onto the PartyKit Worker**; add origin allowlist and rate limiting; delete tRPC. Verify `livekit-server-sdk` signing on Workers first. *3-4 days, one backend instead of two.*
10. **Ship a real service worker**: app shell cache, offline screen, reconnect banner. *2-3 days. Needed for Guideline 4.2 regardless, and it's the PWA you claimed to have.*
11. **Playwright two-client E2E** with fake media devices; assert connection state, track counts, `getStats()`, and mid-song join convergence. *3 days.*
12. **Room-scoped feature flags in `RoomState`,** defaulted from PartyKit env. *1 day, unblocks trunk-based shipping of anything larger.*
13. **`concurrency` group on the PartyKit deploy workflow** plus a PR-template additive-protocol checkbox. *1 hour.*

### Days 61-90: native, conditionally

14. **pnpm workspace + Turborepo,** promoting `shared/protocol` and `shared/core` to packages. Only now, only if the boundaries have held. *1-2 days.*
15. **Capacitor Android shell to the Play internal track,** with foreground service (`FOREGROUND_SERVICE_TYPE_PHONE_CALL`), push notifications for "your turn is next," haptics on turn and reaction events, deep links to `/room/[code]`, and an offline screen. *2-3 weeks including managed CI setup.*
16. **iOS shell to TestFlight, gated on Spike A and B outcomes.** If Spike A failed, the proxy-HTML referrer workaround is a prerequisite. If Spike B failed badly, ship iOS anyway with foreground-only singing plus the §3 item-1 stall detection carrying the UX, and say so in the release notes.
17. **Deploy-ordering workflow** (PartyKit → health check → Vercel deploy hook), or skip if item 9 made the Next.js app fully static.
18. **Write down the RN trigger condition** and stop thinking about it: "if iOS background singing is a top-3 complaint after 3 months of native distribution, spike LiveKit RN + `react-native-audio-api` for 2 weeks, accepting that the per-person mixer must be re-solved."

**If you only do four things:** items 1, 3, 4, and 6. A stall-resilient room, two spikes that decide your roadmap, one protocol source of truth, and the first tests in a codebase whose most fragile code has none.
