# Analytics

Product analytics for Karaoke Now. One vendor (PostHog), one client module
(`src/lib/analytics.ts`), one typed event union. If an event is not in the union it does
not exist, and the union and this document move in the same change.

PostHog is the choice because the mobile pivot is decided: `posthog-react-native` is a
first-party SDK with the same event model, so the taxonomy below survives the port. The
web SDK is loaded through a dynamic `import("posthog-js")` that only runs when
`NEXT_PUBLIC_POSTHOG_KEY` is set, so an unconfigured build (local dev, CI, e2e) never
fetches the vendor bundle and every `track()` call is a no-op.

## Configuration

| Variable | Required | Meaning |
| --- | --- | --- |
| `NEXT_PUBLIC_POSTHOG_KEY` | no | Project API key. Absent means analytics is a full no-op. |
| `NEXT_PUBLIC_POSTHOG_HOST` | no | `https://eu.i.posthog.com` or `https://us.i.posthog.com`. Defaults to the US host. A value that is not an https URL falls back to the default rather than shipping events at a typo. |

Init is deliberately quiet: `autocapture: false`, `capture_pageview: false`,
`capture_pageleave: false`, `capture_exceptions: false`, `disable_session_recording: true`,
`disable_surveys: true`, `respect_dnt: true`, `person_profiles: "never"`. Do Not Track is
also checked before the import, so a DNT browser does not even download the SDK, and
`analyticsEnabled()` reports the same answer to call sites that would otherwise write local
state for an event that will never be sent.

**Those flags do not cover the default properties, and that is the part that matters
here.** posthog-js attaches `$current_url`, `$pathname`, `$host`, `$referrer` and their
`$initial_*` and `$session_entry_*` copies to every `capture()` regardless of the capture
flags, and with `persistence: "localStorage"` the `$initial_*` ones are frozen on first
visit. The room page is `/room/<CODE>`, and a legacy share link is
`/room/<CODE>?name=<display name>`, so those properties are the room code and sometimes the
display name. Two mechanisms stop them:

- `property_denylist` (`POSTHOG_PROPERTY_DENYLIST` in `src/lib/analytics.ts`) names every
  URL, host and referrer property, the `$initial_*` and `$session_entry_*` variants and
  `$raw_user_agent`. PostHog deletes them from the final property object.
- `sanitize_properties` runs first and drops the same keys plus **any** property whose
  value is a URL, whatever it is called, so an SDK upgrade that renames or adds one cannot
  quietly start shipping room codes.

`mask_personal_data_properties: true` and `disable_capture_url_hashes: true` are set as
well, for the query-string and fragment surfaces.

### Vendor context properties

What posthog-js still attaches, and what the taxonomy therefore names: `$browser`,
`$browser_version`, `$os`, `$os_version`, `$device_type`, `$screen_width`/`$screen_height`,
`$viewport_width`/`$viewport_height`, `$timezone`, `$lib`/`$lib_version`, `$session_id`,
`$window_id`, `$insert_id` and `$time`. Browser and device type are what make
`playback_blocked_shown` and `bt_notice_shown` readable at all: the autoplay tax is a
per-browser number. The full user-agent string is denied.

## Identity

The distinct id is an anonymous per-browser id (`karaoke-device-id` in localStorage,
`crypto.randomUUID`). It is separate from `karaoke-client-id`, which the room server uses
for admin reclaim and kick bans: a moderation identifier does not belong in a vendor.

**The display name is never sent**, not as a property and not as a person profile. With
`person_profiles: "never"` no profile is created at all, so there is nothing to attach one
to.

## Taxonomy

| Event | Props | When | Why |
| --- | --- | --- | --- |
| `room_created` | - | The create card on `/` mints a code, before the navigation. | Top of the funnel. Creates minus joins is the drop between making a room and getting into it. |
| `room_joined` | `role: "creator" \| "joiner"`, `rejoin: boolean` | The local peer appears in the roster, which is the moment the join is real (a locked room sits on the auth modal until then). | Party size and retention. `rejoin` separates a returning room from a fresh one; `role` separates hosts from guests. |
| `queue_joined` | - | The user taps "Add to queue" (queue panel or stage banner). | Intent to sing. The gap to `turn_started` is the queue's cost. |
| `turn_started` | - | The room puts this client on stage (`isMyTurn` becomes true). | Denominator for everything about singing. |
| `turn_finished` | `duration_s: number`, `finished_by: "self" \| "skip" \| "timeout"` | The stage leaves this client. | How turns end. A rising `timeout` share means people take the stage and cannot get started. |
| `song_loaded` | `genre: Genre \| "unknown"`, `has_search: boolean` | A video is picked, from search results or a pasted link. | Whether in-app search is worth its YouTube quota, and which genres the room actually sings. |
| `reaction_sent` | `emoji: string` | A reaction is sent (after the client-side cooldown). | Which of the five reactions earn their place in the bar. |
| `chat_sent` | `length_bucket: "short" \| "medium" \| "long"` | A non-empty chat message is sent. | Chat volume and shape, with no way back to what was said. |
| `audio_recover_tapped` | - | The user taps "tap to bring the sound back", the toolbar recover control, or the stage tap-to-play. | The size of the silent-audio problem, and the conversion from `playback_blocked_shown`. |
| `mic_restart_tapped` | - | The user taps "mic stopped, tap to restart". | How often the OS takes the mic away in practice. |
| `bt_notice_shown` | - | The Bluetooth route notice becomes visible, at most once per room session. | How many sessions are on a headset that cannot hold A2DP with a mic open. |
| `playback_blocked_shown` | - | Any surface telling this device its audio is blocked becomes visible (blocked remote voices, or the stage tap-to-play), at most once per room session. | The autoplay-policy tax, per browser. |
| `app_error` | `namespace: string`, `message: string` (≤120 chars) | Any `logger.error(...)` anywhere in `src/`. | Which subsystem fails in the field, without asking users to read their console. |

`app_error` reports the log message plus the message of an `Error` argument, and nothing
else. A call site whose reason is a plain string must interpolate it into the message
(`log.error(\`Server error: ${msg.message}\`)`) or the event says nothing; a call site whose
argument holds user data (a raw wire frame, a device label) must leave it a detail, where
it can reach the console but never the event.

Bucket thresholds for `chat_sent`: `short` ≤ 20 characters, `medium` ≤ 80, `long` above.

`Genre` is the union in `src/lib/atmosphereGenre.ts`. A pasted link has no genre at pick
time (the atmosphere provider resolves it afterwards), so it reports `"unknown"`.

### Inferred properties

Two properties are inferred rather than read off the wire, because the protocol carries
neither and a protocol change is a deploy-ordering problem:

- `turn_finished.finished_by` is decided on the singer's own client, and only there, so a
  turn is counted once. `"self"` when a local control ended it (Done, or leaving the
  queue). Otherwise the server took the stage away, and the server disarms its 60s idle
  timer while the stage video plays: a turn cut short mid-song was an admin skip, an idle
  one was that timeout. A skip of an idle singer therefore reads as `"timeout"`.
- `room_joined.rejoin` compares a locally stored, per-device salted marker of the room
  code (see the privacy rules below). It is written only when analytics is actually
  enabled, so a Do Not Track browser keeps no room history either.

## Privacy rules

Never sent, under any event:

- **Display names.** Not as a property, not as a person profile, not in an error message.
- **Chat content.** Only a length bucket.
- **Video ids, titles, channels and thumbnails.** Only the genre and whether search was used.
- **Room codes.** A room code is the invite secret. No event carries one, and no event
  carries anything derived from one. The only room-scoped fact we keep is "has this device
  been in this room before", answered by `karaoke-rooms-visited` in localStorage: last 20
  entries, each a short digest of a per-device random salt (`karaoke-rooms-salt`) plus the
  code. The salt makes an entry meaningless on any other device; it does not make it
  expensive to reverse on this one, because the code space is only 32^6. **That value is
  local state, not an anonymised room id, and it must never be sent anywhere.** If an event
  ever needs a room dimension, it needs a new design, not this string.
  The URL properties in the Configuration section are the other half of this rule: the room
  page path is the room code.
- **Error stacks, and the arguments of a log call.** `app_error` carries the log message
  plus the message of an `Error` argument, truncated to 120 characters. Device labels,
  raw payloads and stacks stay on the device.
- **IP-derived precision beyond PostHog's default**, and no session recording, no
  autocapture, no pageviews, no surveys: a build that collects something the taxonomy does
  not name is a bug.

Throttling: `app_error` is capped at 10 events per page session, so a loop in a broken
subsystem cannot turn one user's bad night into a bill. The three notice events are
latched per room session for the same reason, and because a device whose audio is already
failing should not be asked to capture the same fact on every retry tick.

Both notices and the join event are reported from a ref-latched effect, not from the
boolean itself: `playbackBlocked` flips back and forth as the 1s play retry briefly
succeeds, and `bluetoothDetected` flips on every route change.

## Adding an event

1. Add the variant to the `EventProps` interface in `src/lib/analytics.ts`. Propless events
   take `undefined`; everything else takes an exact object type. The two `track` overloads
   then make the call site fail to compile if the props are wrong or missing.
2. Instrument it at the natural seam: the handler that carries the user's intent, not a
   server echo of it, and not a new abstraction built to host it. Put the `track` call
   *after* the work the handler exists to do. `track` swallows a throwing vendor already,
   but ordering is the guarantee that does not depend on the vendor: three of these call
   sites are the taps a user reaches for when the room's audio is already broken.
3. Add a row to the table above with when and *why*, and check the props against the
   privacy rules. An event without a decision behind it is noise nobody deletes later.
4. Run `npm run lint && npm run typecheck && npm run test`.

The union and this document are one change. A PR that adds one without the other is
incomplete.

## Logging, and where `app_error` comes from

`src/lib/logger.ts` is the only file in `src/` allowed to touch `console` (biome's
`suspicious/noConsole` enforces it, with `party/log.ts` as the server-side twin). Every
module holds a namespaced logger and the bracket prefix is unchanged: `[LiveKit] ...`.

- Production drops `debug` and `info` unless the debug gate is on; `warn` and `error`
  always emit.
- The gate is `karaoke-debug` in localStorage, or `?debug` on any URL, which persists so
  the reload that reproduces the bug still logs. `?debug=0` turns it back off.
- A suppressed line is dropped, not retained. Log details hold display names, device
  labels and raw wire frames (chat text included), so nothing buffers them. A diagnostics
  surface that wants history has to arrive with its own redaction, not inherit a buffer
  that was already collecting.
- The console call lives in `src/shared/log.ts`, which both `src/lib/logger.ts` and
  `party/log.ts` wrap. It keeps no module state that outlives a call, because it is
  bundled into the Durable Object and the Next server, where such state is shared by every
  user and every room.
- `logger.error` also feeds `app_error` through the sink analytics registers at init, which
  is why an error path needs no analytics call of its own.


## Verifying delivery

posthog-js silently drops events from automated browsers (`navigator.webdriver`, HeadlessChrome brands) unless `opt_out_useragent_filter` is set, and we keep the filter ON so QA bots never pollute product data. Consequence: a Playwright session proves init (the `config.js` fetch) but can never prove capture. To verify delivery end to end, send a probe through the capture API instead (`POST https://us.i.posthog.com/i/v0/e/` with the project key) and read it back with a HogQL query through the management API.
