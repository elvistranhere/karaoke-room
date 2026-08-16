# Capacitor track: scaffold status

Covers the code-side half of #34 (Android shell to the Play internal track) and #35 (iOS shell to TestFlight, gated on spikes). Companion to `docs/plans/2026-08-16-cross-platform-playbook.md`, items 15 and 16.

Status: **JS-side scaffold only.** No native platform folder exists in this repo, and none can be generated on this machine yet. Everything below the "Needs the owner" line is blocked on toolchains and accounts, not on code.

---

## 1. Toolchain audit (2026-08-17, this machine)

| Check | Command | Result |
| --- | --- | --- |
| Xcode | `xcodebuild -version` | Fails. Active developer dir is `/Library/Developer/CommandLineTools`, no `/Applications/Xcode*.app` |
| CocoaPods | `which pod` | Not installed |
| Android SDK | `ls "$ANDROID_HOME"` | `ANDROID_HOME` and `ANDROID_SDK_ROOT` are both empty, no `~/Library/Android` |
| Android tooling | `which adb sdkmanager gradle` | None found, no Android Studio |
| Java | `java -version` | No Java runtime installed |

Consequence: `@capacitor/ios` and `@capacitor/android` were deliberately **not** installed and `npx cap add ios` / `npx cap add android` were **not** run. `cap add` shells out to Xcode and Gradle, so generating the folders here would produce a platform project that has never been opened by the tool that owns it. The platform packages get installed at the same time as the toolchain, by whoever owns the machine that builds the binaries.

---

## 2. What was scaffolded

**Dependencies** (`package.json`, both in `devDependencies`):

- `@capacitor/core` 8.5.0
- `@capacitor/cli` 8.5.0

They are dev dependencies on purpose. Nothing under `src/` imports Capacitor yet, so nothing pulls it into the Next build, and `devDependencies` is the structural version of that promise. `@capacitor/core` moves to `dependencies` on the first line of app code that calls a plugin API (haptics, push registration, deep link handling), not before.

**`capacitor.config.ts`** (repo root):

- `appId: "com.karaokenow.app"` - must match the bundle id registered in App Store Connect and the application id in the Play Console. Changing it after the first store upload means a new app listing, so it is fixed now.
- `appName: "Karaoke Now"`
- `webDir: "public"`
- `server.url: "https://karaoke-room.vercel.app"`

**`npm run cap:sync`** (`cap sync`). Verified green with zero platforms installed: it runs `copy web` and `update web` and exits 0. `cap:android` and `cap:ios` scripts are intentionally absent, since `cap open android` / `cap open ios` would only fail without the toolchains. Add them in the same change that adds the platform folder.

### Why `server.url` points at production

The config file carries no comments by house rule, so the reasoning lives here.

With `server.url` set, the native WebView loads the deployed Vercel app instead of a bundled web build. That is the shortest path to a shell that actually runs, and it sidesteps the whole `output: 'export'` migration described in section 2 of the playbook (three server surfaces, `/api/livekit-token`, `/api/youtube-search` and `/api/trpc`, would have to move onto the PartyKit Worker first).

Three things follow from that choice and should be revisited before any store submission:

1. **Same-origin still holds today.** The WebView's origin is `https://karaoke-room.vercel.app`, so `/api/livekit-token` stays a same-origin GET. The day the app serves a bundled `webDir` instead, the origin becomes `capacitor://localhost` or `https://localhost` and that endpoint is suddenly cross-origin and unauthenticated. The origin allowlist and rate limit called for in the playbook are a prerequisite for that switch, not for this one.
2. **`webDir: "public"` is a placeholder that keeps `cap sync` honest.** It points at a directory that exists so the CLI does not fail, and with `server.url` set the bundled assets are only the fallback the WebView never reaches. It becomes `out` when `output: 'export'` lands.
3. **A remote-URL WebView with no native features is the exact shape Apple rejects** as "not sufficiently different from a web browsing experience." The product work in #34 and #35 (push, haptics, deep links, a real offline screen) is what makes the submission viable, so none of it is optional polish.

### Verified not broken

`npm run lint`, `npm run typecheck`, `npm run test` (104 tests) and `npm run build` are all green after the change. `grep -rl capacitor .next/static .next/server` returns zero files, so no Capacitor code reaches either the client bundle or the server output.

---

## 3. Needs the owner

None of this is code. It needs a machine, money, or an Apple or Google account.

**Android (#34)**

- Android Studio plus the SDK platform and build tools, and a JDK (there is no Java runtime on this machine at all). Export `ANDROID_HOME`.
- Then: `npm i -D @capacitor/android && npx cap add android`, add a `cap:android` script, commit the `android/` folder.
- Google Play Console account (one-time 25 USD), app record under `com.karaokenow.app`.
- Upload keystore plus Play App Signing enrollment. The keystore and its passwords are the one artifact that cannot be regenerated, so decide where they live (repo secrets for CI, password manager for the human copy) before the first upload.
- Internal testing track set up, testers invited.
- Device runs: mic capture, screen lock behaviour, and the foreground service notification cannot be judged from an emulator.

**iOS (#35)**

- Xcode from the App Store, then `sudo xcode-select -s /Applications/Xcode.app`, accept the license, install CocoaPods.
- Apple Developer Program membership (99 USD per year).
- App ID registration for `com.karaokenow.app`, signing certificate, provisioning profiles, App Store Connect app record, TestFlight internal group.
- Physical iPhone. Simulator does not reproduce either of the two conditions the spikes exist to measure.

**The two spikes, which gate #35 entirely.** Both are blocked on Xcode. Run them on a bare Capacitor shell before any shell product code gets written.

- **Spike A: YouTube IFrame inside WKWebView.** Timebox 2 days. WKWebView does not send the `Referer` header Safari does and YouTube's embed validation answers with Error 153. Known workaround is a proxy HTML page served from our own domain to carry the referrer, plus `allowsInlineMediaPlayback = true` at the native config layer (not just `playsinline=1` in the HTML) or iOS forces fullscreen. Fullscreen would defeat `VideoStage`'s transparent blocker and `inert` container, which is a hard product constraint. Success criterion: the video loads, `getAvailablePlaybackRates()` returns fractional rates, and the blocker still swallows touch. If A fails, the proxy-HTML workaround is a prerequisite for the iOS shell.
- **Spike B: background mic and background timers.** Timebox 2 days. WKWebView's `microphoneCaptureState` goes to muted shortly after `applicationDidEnterBackground` (WebKit bug 241480), and Web Audio suspends with it. Test the singer case specifically: start singing, background the app, then check whether the published LiveKit track goes silent and whether `useVideoSync`'s 300ms interval keeps firing. Assume the answer is bad. If B fails, ship iOS with foreground-only singing and let the server-side stall detection in `party/index.ts` carry the UX, and say so in the release notes.

---

## 4. Still open, code side

Everything here needs the native platform folder first, so it is ordered behind section 3.

**Foreground service (Android, #34).** Long-running mic work needs a foreground service with an ongoing notification, and WebRTC calling now requires `FOREGROUND_SERVICE_TYPE_PHONE_CALL` rather than `TYPE_MICROPHONE`. Work: pick the plugin (Capawesome's Android foreground service plugin is the obvious candidate) or write a thin custom one, declare the permission and service type in `AndroidManifest.xml`, start the service when a turn starts and stop it when the turn ends. The natural call sites are the same two the audio pipeline already uses, `startSinging` and `stopSinging` in `src/hooks/livekit/capture.ts`, which CLAUDE.md flags as requiring careful review. Bridge calls are expensive, so this must stay a start and stop pair and never anything at UI rate.

**Push, "your turn is next" (#34, and #35 if it ships).** Not started, and it is the single strongest native-value argument for both store reviews. Shape of the work:

- `@capacitor/push-notifications`, plus an FCM project and `google-services.json` for Android and an APNs key for iOS.
- A device token has to reach the server. That is a new wire message, so it follows the four-step process in CLAUDE.md: add the variant to `clientMessageSchema` in `src/shared/protocol.ts` first, then the `party/index.ts` handler, then `useRoomState`, then the call site.
- The sender belongs in `party/index.ts`, because the queue lives there and `promoteNextSinger()` already knows exactly when the next singer is up. Fire on the transition into second place, not on promotion, or the notification arrives after the turn has started.
- Token lifetime is the part that bites: tokens rotate, participants are ephemeral, and rooms clear their participant list when they empty. Decide storage before writing the handler.

**Also in #34 scope and not started:** haptics on turn and reaction events, deep links to `/room/[code]` (needs `assetlinks.json` and `apple-app-site-association` served from the Next app plus intent filter and associated-domains entitlement on the native side), and a native offline screen. The web `/offline` route and its service worker already exist, but they do not cover the case that matters natively, which is `server.url` being unreachable at launch.

**Version scheme.** Once binaries exist, native and web versions diverge. Bump the native number only when a binary goes through review, bump the web number on every deploy, and surface both in the settings drawer so a bug report names the pair.
