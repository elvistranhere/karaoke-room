# Audio test matrix

Manual release matrix for the audio experience. Written 2026-08-17 against the code audited in `docs/qa/AUDIO-QUIRKS-AUDIT.md`. Every `F<n>` and `D<n>` marker in a cell points at a row in that document.

The bar this sheet defends: **the same room sounds the same on every device**. Music is a local YouTube iframe per client, voices are LiveKit through the Web Audio mixer, and the singer is the clock authority, so one broken client can be silent, desynced, or can freeze the whole room. Those three failure shapes are what the expected-behavior cells are written against.

## Gear and setup

- Two phones minimum (one iOS, one Android), plus a desktop browser as the third client. A second person is only needed for the phone-call row.
- One pair of Bluetooth earbuds, one pair of wired headphones with the right adapter, one Lightning or USB-C to 3.5mm dongle.
- Both phones on cellular data, not the same Wi-Fi as the desktop, for the network rows.
- Same room code on every client. Give each client a distinct display name so the People panel rows are unambiguous.
- Use a long track (4 minutes or more) so background and lock scenarios have room to run.
- Setup time: 15 minutes, once per pass.

## Legend

| Marker | Meaning |
| --- | --- |
| PASS text | What a correct build does. This is the assertion. |
| `KNOWN: F<n>` | The current build is expected to fail this cell. `F<n>` is the fix in the audit's Fix next list. Log it, do not re-file it. |
| `D<n>` | Unknown behavior. First device pass owns it. Write down what actually happens, then this cell gets a real expectation. |
| `n/a` | Scenario does not exist on that platform. |
| Same as X | Identical expectation to column X, no separate observation needed unless X failed. |

Roles in the steps: **A** is the singer and clock authority, **B** is a listener on the other phone, **C** is the desktop listener.

---

## 10-minute smoke subset

Run before every release, on one iOS device and one Android device, one of them installed as a PWA. Ten minutes per device pair, both devices driven at once. If any smoke step fails, stop and fix. Do not ship on a smoke failure and a promise to check the full matrix later.

| # | Step | Pass criteria | Time |
| --- | --- | --- | --- |
| SM1 | Both clients open the room, tap Join the party | Music starts on both within 2s of the tap, nothing audible before it | 1 min |
| SM2 | A takes the stage and sings 20 seconds | B hears A's voice inside 3s, B still hears music, A hears their own music not their own voice | 2 min |
| SM3 | B opens the People panel, drops A to 0, then mutes and unmutes A | Voice goes silent and comes back, music unchanged. On iOS see `KNOWN: F9` | 1 min |
| SM4 | C joins mid-song | C converges to within about 0.2s of A inside 5s without an audible seek storm | 1 min |
| SM5 | A backgrounds the app for 10s mid-song, returns | Room pauses on hide and resumes on return, and A's mic is still publishing to B afterwards. See `KNOWN: F4` | 2 min |
| SM6 | B locks the screen for 20s, unlocks | B is back in sync inside 3s and still hears both music and voices | 1 min |
| SM7 | A runs mic check, then cancels it | Self-monitor loopback is audible, the button returns to idle, and the next singing turn still works. See `KNOWN: F1` | 1 min |
| SM8 | Kill Wi-Fi on B for 10s, restore | Reconnect banner appears and clears, B rejoins in sync, voices come back without a reload | 1 min |

## Time estimates per full pass

| Lane | Scenarios | Time |
| --- | --- | --- |
| iOS Safari | T01-T19 | 60 min |
| iOS PWA standalone | T01-T19 | 50 min |
| Android Chrome | T01-T17, T19 | 60 min |
| Android PWA | T01-T17, T19 | 45 min |
| Desktop (Chrome plus Safari) | T01-T09, T14-T17, T19 | 30 min |
| Setup and room resets | all | 15 min |
| **Full matrix, one person, two phones** | | **about 4 hours 20 minutes** |
| First device pass only: the `D<n>` rows | D1-D10 | plus 60 min |
| Samsung Internet lane, when a Galaxy is available | T01-T05, T08, T12, D2, D6, D7 | plus 30 min |

A pass is one person with two phones plus a laptop. Two people running the phone lanes in parallel takes it to about 2 hours 30 minutes, and the phone-call row needs the second person anyway.

---

## Matrix

### A. Core room

| ID | Scenario | iOS Safari | iOS PWA | Android Chrome | Android PWA | Desktop |
| --- | --- | --- | --- | --- | --- | --- |
| T01 | Join and listen | Nothing audible until the Join tap, then music and every live voice start together. Mic prompt is asked once, after the tap, with the overlay copy visible. `KNOWN: F10` fires it at page load instead | Same as iOS Safari, and the mic prompt is asked again even if Safari already granted it, because the install is its own permission scope | Same, and the grant persists per origin across sessions | Same as Android Chrome | Same, no route or session concerns |
| T02 | Take stage and sing | A's voice reaches B and C within 3s of the turn starting. A hears music and not their own voice. Volume behavior changes to the call curve once the mic opens, `D5` | Same as iOS Safari | Same, and if a Bluetooth output is active the capture pins the built-in mic, see T12 | Same as Android Chrome | Same |
| T03 | Mic check | Loopback self-monitor is audible within 1s, the meter moves, Stop returns to idle and releases the mic. Run it twice in a row and after an interruption. `KNOWN: F1` can leave the button dead forever if the session is interrupted during the check | Same as iOS Safari, higher risk, `D3` | Loopback audible, and stopping it does not leave the route in call mode | Same as Android Chrome | Same |
| T04 | Voice effects while singing | Switching Hall, Echo, Warm, Bright, Chorus mid-song changes the sound for B within 1s with no dropout longer than 200ms and no republish that B hears as a reconnect. Toggling noise cancellation is the same bar. `KNOWN: F6` re-captures the mic on every toggle | Same as iOS Safari | Same, plus on a Bluetooth route each toggle can cost 1 to 8 seconds of silence, `KNOWN: F6` | Same as Android Chrome | Same, clean swap expected |
| T05 | Per-person volume and mute | Per-person slider and mute change only that voice on the local device, never for anyone else, and survive the singer changing. `KNOWN: F9` when the Web Audio graph is not running, iOS ignores element volume so sliders do nothing while mute still works | Same as iOS Safari | Slider and mute both effective, master and music independent | Same as Android Chrome | Same, this is the reference behavior |
| T06 | Deafen | Deafen silences every remote voice locally and leaves music playing. The roster shows the glyph on other clients and no other client changes its own audio because of it. Undeafen restores the previous per-person levels, not defaults | Same as iOS Safari | Same | Same | Same |
| T07 | Sync convergence after mid-song join | C joins 90s into a song and lands within about 0.2s of A within 5s, correcting by rate nudge, with at most one audible seek | Same as iOS Safari | Same | Same | Same |

### B. Interruptions and lifecycle

| ID | Scenario | iOS Safari | iOS PWA | Android Chrome | Android PWA | Desktop |
| --- | --- | --- | --- | --- | --- | --- |
| T08 | Background mid-song, singer role | On hide the room pauses for everyone within 1s and the clock is handed back. On return playback resumes and A is still publishing audible voice to B. `KNOWN: F4` no mute or ended watcher exists, so A can return publishing silence with a live-looking mic button | Same as iOS Safari, worse: standalone loses the mic where Safari sometimes keeps it, `KNOWN: F5` | Same expectation, same missing watcher, `KNOWN: F4` | Same as Android Chrome | Tab switch is not a hide on desktop, expect no pause and no interruption |
| T09 | Background mid-song, listener role | Music and voices may pause while hidden. On return both come back within 2s without a tap and the position is correct. Voices blocked by autoplay must show a tap-to-resume affordance, `KNOWN: F2` there is no such UI for voices today, only for the video | Same as iOS Safari | Music keeps playing while hidden, voices may drop. Return restores both, `KNOWN: F2` | Same as Android Chrome | Hidden tab keeps playing, expect no change |
| T10 | Screen lock | Wake lock holds the screen on for the whole song, so this only happens on a deliberate power-button press. After unlock the client is back in sync inside 3s. If A locked, the room pauses within 10s through the server stall timer and posts a system chat line, `D9` confirms lock fires the visibility change on every device | Same as iOS Safari | Same, and a refused wake lock on low battery is currently invisible, `KNOWN: F19` | Same as Android Chrome | n/a |
| T11 | Incoming phone call mid-song | Take a real call on the device under test for 15s and hang up. Expected: the room pauses if A is the caller, and after the call both music and voices come back within 3s of returning to the app, with no tap needed beyond one visible resume affordance. `KNOWN: F7` an interrupted context is never rebuilt, and `KNOWN: F4` the mic can come back muted | Same as iOS Safari, and this is the highest-value single row on iOS | Media is muted and WebRTC re-routes. Return restores both, `KNOWN: F4` | Same as Android Chrome | n/a |
| T18 | Ringer or silent switch mid-song, iOS only | Flip the mute switch during a song with voices live. Expected: nothing changes, music and voices both keep playing, because the session type is set to playback whenever no capture is held | Same as iOS Safari | n/a | n/a | n/a |
| T19 | Back-to-back turn handoff | A finishes, B starts within a few seconds, three times in a row. Expected: no dropout for the room longer than 1s, no audible route change or re-pop on the handoff, and the previous singer's mic returns to its pre-turn state. On iOS listen specifically for the session flipping type at the boundary, `D5` | Same as iOS Safari | Same, plus listen for an SCO flip on a Bluetooth route, `KNOWN: F6` | Same as Android Chrome | Same, reference behavior |

### C. Routes and devices

| ID | Scenario | iOS Safari | iOS PWA | Android Chrome | Android PWA | Desktop |
| --- | --- | --- | --- | --- | --- | --- |
| T12 | Bluetooth connect mid-song | Connect earbuds while A is singing. Expected: audio moves to the earbuds within 3s, the Bluetooth quality notice appears, the published track keeps flowing, and quality drops to call quality for the singer only. `KNOWN: F6` the device-change probe re-opens a capture and can mute the live track | Same as iOS Safari | Same, and the capture pins the built-in mic so the headset output keeps A2DP where the OEM allows it. Expect up to 8s of glitch on Xiaomi or OPPO | Same as Android Chrome | Route change should be inaudible beyond the switch itself |
| T13 | Bluetooth disconnect mid-song | Power the earbuds off while singing. Expected: audio returns to the speaker within 3s, the published track survives, and the notice clears | Same as iOS Safari | Same, and the built-in-mic pin releases | Same as Android Chrome | Same |
| T14 | Wired headphone unplug | Unplug during playback. Expected: on the singer this behaves like an external pause, the room pauses within 1s and resumes on the singer's play, and voices continue on the speaker. On a listener, nothing more than the route change | Same as iOS Safari | Same | Same as Android Chrome | Same |
| T15 | Device switch in Sound Profile | Change the input device while singing. Expected: at most one short dropout, the published track keeps its identity for B, and the choice sticks. Output picker is hidden on mobile because `setSinkId` has no targets there. iOS loses the saved choice on reload, `KNOWN: F17` | Same as iOS Safari | Input switch works, output picker hidden, choice persists across reload | Same as Android Chrome | Both pickers visible, output switch moves music and voices together |

### D. Network and install

| ID | Scenario | iOS Safari | iOS PWA | Android Chrome | Android PWA | Desktop |
| --- | --- | --- | --- | --- | --- | --- |
| T16 | Network drop and rejoin | Airplane mode for 10s during a song, then back. Expected: the reconnect banner appears and clears without a reload, the roster reheals, playback catches up to the room position within 5s, and voices resume. If A dropped, the room pauses within 10s and posts a system line | Same as iOS Safari | Same | Same as Android Chrome | Same |
| T17 | Installed app vs browser parity | Run T01, T02, T08, T11 in Safari and again in the installed app on the same device and compare. Expected: identical audio behavior. Known divergences to log rather than assume: mic permission is asked again per install scope, and standalone loses the mic on background where Safari may not, `KNOWN: F5`, `D3`, `D4` | This is the column under test | Compare Chrome to the installed app, expect no divergence | This is the column under test | n/a |

---

## Scenario steps

Exact steps, so two people run the same test. Every scenario starts with all clients joined to the same room and a song queued.

- **T01 Join and listen.** Open the room URL cold. Confirm silence before the tap. Tap Join the party. Note the delay to first music and the delay to first voice, and when the mic prompt appeared relative to the tap.
- **T02 Take stage and sing.** A adds a track and takes the stage. Speak a counted "one two three four" so B and C can report the delay. Confirm A does not hear their own voice through the room and does hear the music.
- **T03 Mic check.** From the Sound Profile, start mic check, speak, confirm loopback and meter, stop. Repeat immediately. Then start it and background the app for 5s before returning, and confirm the button is not stuck.
- **T04 Voice effects while singing.** While A sings, cycle every effect once, then toggle noise cancellation twice. B reports each transition as clean, glitched, or a dropout with a duration.
- **T05 Per-person volume and mute.** On B, open the People row for A, drag to 0, back to 100, then mute and unmute. Repeat with the master slider and the music slider. Confirm nothing changed on A or C.
- **T06 Deafen.** B deafens for 15s during a song with A singing, then undeafens. Check the roster glyph on A and C, and that A and C heard no change to their own audio.
- **T07 Sync convergence after mid-song join.** With a song 90s in, join from C. Watch the position converge. Log seconds to converge and how many audible seeks.
- **T08 Background mid-song, singer.** A presses the home gesture for 10s, returns. Log room pause, resume, and whether B still hears A afterwards without A touching anything.
- **T09 Background mid-song, listener.** Same for B while A keeps singing. Log whether music and voices resume unaided.
- **T10 Screen lock.** Confirm the screen has not slept by itself for a full song first, which tests the wake lock. Then power-button lock for 20s and unlock. Run once as A and once as B.
- **T11 Incoming phone call mid-song.** Second person calls the device under test. Answer, hold 15s, hang up, return to the app. Run once as A and once as B.
- **T12 and T13 Bluetooth.** Connect earbuds mid-song, wait 30s, power them off mid-song. Log route change time, glitch length, whether the published track survived, and whether the notice appeared and cleared.
- **T14 Headphone unplug.** Plug wired headphones in during playback, then unplug mid-song. Run once as A and once as B.
- **T15 Device switch in Sound Profile.** While singing, switch the input to another available device and back. Then reload the page and confirm whether the choice survived.
- **T16 Network drop and rejoin.** Airplane mode 10s. Log banner, roster, playback catch-up, and voice return. Run once as A and once as B.
- **T17 Install parity.** Install to the home screen, then run T01, T02, T08 and T11 in the installed app and compare against the same device's browser results from this pass.
- **T18 Ringer switch.** iOS only, flip the hardware mute switch during a song with voices live, then flip back.
- **T19 Turn handoff.** Three consecutive handoffs A to B to A. Log dropout length and any audible route or level change at each boundary.

---

## First device pass

These have no expected behavior yet. The first pass on real hardware writes one. Ordered by value.

| ID | What to find out | Where | Cost |
| --- | --- | --- | --- |
| D2 | Does a Galaxy on Samsung Internet publish clean audio for 60s of singing, or periodic dropouts, given the app's `getUserMedia` to Web Audio graph to peer connection topology | Galaxy, Samsung Internet, second client listening | 30 min |
| D1 | Is the music slider inert on iOS, that is, does the YouTube iframe ignore `setVolume` | iPhone, Safari and installed | 20 min |
| D3 | Does `AudioContext.resume()` fail in the installed app on the current iOS point release | iPhone, installed only | 20 min |
| D4 | Full audio matrix in standalone, now that iOS 26 installs as a web app by default | iPhone, installed | included in the PWA lane |
| D5 | Is the session type flip at each turn boundary audible, and how far does the hardware volume curve move once capture is live | iPhone, both modes | 20 min |
| D9 | Does a power-button lock fire the visibility change on every device, or does the 10s server stall timer have to carry it | all phones | 10 min |
| D7 | Do One UI Separate app sound and the pop-up video player detach or hijack the embed | Galaxy | 20 min |
| D6 | Does Samsung Internet behave like Chrome on T01 to T05 | Galaxy | 20 min |
| D8 | Which OEM power manager settings change the background outcome, on a Pixel, a Galaxy, and a Xiaomi or OPPO | three Android devices | 30 min |
| D10 | Every Capacitor shell row | blocked, no native project or toolchain exists | n/a |

## Result log

Copy this block per pass and keep it with the release notes.

```
Pass date:
Build / commit:
Devices: iOS <model, OS version>  Android <model, OS version>  Desktop <browser, version>
Smoke: SM1..SM8 pass/fail
Full matrix run: yes/no      Lanes covered:
Failures (ID, lane, what happened, is it a KNOWN marker or new):
Device-pass answers (D<n>, what actually happened):
New quirks found (add a row to AUDIO-QUIRKS-AUDIT.md):
```
