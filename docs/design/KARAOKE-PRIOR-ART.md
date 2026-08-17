# Karaoke prior art: how shipped products solve audio

Research date: 2026-08-17. Every claim below is sourced at the bottom of its section. Vendor doc pages carry no publication date; where a date is given it is the publication date of the article or the priority date of the patent, otherwise treat it as a retrieval date of 2026-08-17.

Read alongside `docs/design/AUDIO-ARCHITECTURE.md` and `src/lib/syncMath.ts`. The SCENARIOS section at the end is written as test-matrix rows so it can be merged into `docs/qa/AUDIO-TEST-MATRIX.md`.

## Our design, restated for contrast

Every client plays the YouTube video locally. The singer is the sync clock: `video-sync` over PartyKit, drift corrected by playback-rate nudges with a seek fallback (`computeSyncAction` in `src/lib/syncMath.ts`). Voice only over LiveKit. All listening volumes are local and per user (`src/lib/volumeModel.ts`, `src/lib/voiceMixer.ts`). No server-side mixing. We do not own the music.

The headline finding: **local playback plus clock sync is the industry-standard architecture, not a shortcut.** Three RTC vendors and one Smule patent independently arrived at it. What separates us from all of them is that they own a seekable audio file with a known duration and we have a YouTube iframe.

---

## 1. Landscape

### Consumer products

| Product | Mixing model | Latency strategy | Transfers to us | Cannot transfer, and why |
| --- | --- | --- | --- | --- |
| **Smule** (Sing, Sing Live) | Capture-side DSP local; server mixes only the recorded artifact | Oboe/AAudio capture, round-trip 109 ms (2017) to 39 ms (2021); per-device latency estimate keyed on model + OS + firmware + audio path; applied as recording "preroll"; manual Vocal Match Slider as escape hatch | On-device 4 Hz pulse-train acoustic loopback calibration; refusal to trust one latency constant across devices; manual offset slider as last resort; noise gate to stop a partner's voice leaking headphone-to-mic; "reduce reverb" as a first-line echo remedy | Preroll re-alignment needs a recorded artifact aligned against a known backing track. Crowd-sourced latency estimation is derived server-side from uploaded vocals vs the owned track. Both die without music ownership. |
| **Smule Sing Live / LiveJam** | Guest uplinks vocals **bundled with the backing track**; host mixes and broadcasts; audience gets one stream | Asymmetric: guest to host latency is masked by the bundle, host to guest latency is tolerated (quoted 40 to 1200 ms, typical 200 to 500 ms). Product instruction: sing to the track, not to the partner's delayed voice | The "sing to the track, not the voice" instruction. And, critically, the patent's own stated alternative: guest broadcasts current song position, host adjusts playback, correction only past **50 ms** drift. That is our architecture, described in a competitor's patent as the fallback | Bundling the backing track into the uplink requires owning the file. YouTube audio never reaches our page (noted in `AUDIO-ARCHITECTURE.md`), so we cannot put it on the wire. |
| **StarMaker** (unverified, third-party SEO sources only) | Client-side | ME tab AUTO-ADJUST plays synchronized patterns and measures playback-to-capture delta in 10 to 15 s. **Unplug/replug the earphones inside the ME tab re-triggers calibration**, so route change is the calibration trigger. Seeds: 200 ms AirPods, 175 ms AirPods Pro | Route change invalidates a stored calibration. Manual fine-tune in 5 to 10 ms steps | Latency-coupled scoring windows need a scored reference melody. |
| **WeSing** (Tencent) | Backend mixing robot; audience pulls one mixed stream | 70 ms end-to-end on RT-ONE, replacing a serial chorus design whose whole problem was accumulated latency | The serial-chorus-is-a-dead-end lesson | Server mixing needs the server to hold the music. |
| **Yokee** | Client-side; effects applied to the vocal in post | None published. "Songs are streamed from YouTube... unfortunately we don't have any control on any of the above." The entire help centre is mic permissions and credits; nothing on latency, alignment, Bluetooth, echo, or sync. The only audio guidance is "use headphones" | This is the most important negative result in the whole survey, see below | n/a |
| **KaraFun** | Client-side, owns multitrack stems | Recommends a cabled mic "to avoid any potential delay"; users hand-adjust A/V delay | Wired-first guidance; a dedicated "I can't hear my voice in the speakers" support topic, which is the monitoring path getting its own front-door | Key/tempo change, vocal guide toggle, Virtual Duo, offline sync of 1000 songs. All stems, all ownership. |
| **BandLab** | Client-side DAW | Web and Android "Latency correction": Automatic acoustic-loopback test or Manual entry "only if the automatic test fails". Test instruction: "Put your headphones or speakers right up to your microphone (do not wear your headphones!)" | The exact browser-feasible calibration flow, including the automatic-then-manual fallback ladder | n/a, this one is fully transferable |

**Yokee is evidence, not an absence.** It is the only shipped product under our exact constraint, karaoke over YouTube with no owned files, and it ships **no voice-to-music alignment surface at all**. The entire record-then-align industry (Smule preroll, StarMaker AUTO-ADJUST, BandLab correction) is downstream of owning the file. Nobody has solved alignment without ownership; the shipped answer has been "do not try". Anything we build here is genuinely new ground, which means it deserves a measurement before it deserves a tuning knob.

Sources: [Android Developers Blog, Smule adopts Oboe, 2022-02-02](https://android-developers.googleblog.com/2022/02/smule-adopts-googles-oboe-to-improve.html); [US11146901B2, Smule, priority 2013-03-15](https://patents.google.com/patent/US11146901); [US11310538B2, Smule, priority 2017-04-03](https://patents.google.com/patent/US11310538B2/en); [US20180174596A1, Smule, priority 2010-04-12](https://patents.google.com/patent/US20180174596A1/en); [Smule Zendesk, Vocal Match Slider](https://smule.zendesk.com/hc/en-us/articles/360027766671-How-to-fix-sync-issues-on-Android); [Smule Zendesk, Microphone Input Selector for iOS, updated 2026-03-26](https://smule.zendesk.com/hc/en-us/articles/47620554762900-Microphone-Input-Selector-for-iOS); [anditasten Smule FAQ, ~Oct 2020](https://anditasten.de/en/smule-app-problems-faq); [WeSing on Tencent Cloud](https://www.tencentcloud.com/customers/detail/2741); [Yokee help centre](https://www.yokee.tv/help/); [KaraFun mic help](https://www.karafun.com/help/general-advanced_251.html); [BandLab, Fixing Latency](https://help.bandlab.com/hc/en-us/articles/115002959414-Fixing-Latency). StarMaker rows are third-party affiliate content ([BitTopup, 2026-01-02](https://bittopup.com/article/StarMaker-Duet-Delay-Fix-BeepSync-Method-Guide-2026)) and are unverified.

### RTC vendor KTV reference architectures

| Vendor | Mixing model | Latency strategy | Transfers to us | Cannot transfer, and why |
| --- | --- | --- | --- | --- |
| **ZEGOCLOUD** | Singers keep independent streams and monitor locally; server mixes **one downlink for the passive audience only**, to keep bandwidth low | "The strategy of playing the accompaniment at each user-end locally"; NTP servers align that local playback. Claims 70 ms end-to-end against a stated 80 ms perceptibility bar, decomposed as sampling, pre-processing, encoding, transmission, decoding, rendering. Supports more than 3 chorus members | The participant-path architecture verbatim: music local, voice independent, monitor local, no server mixing for actives. Lyrics in the media channel so they cannot desync by construction. SEI cadence cap of 30/s and 4096-byte payload as a sanity bound on any progress-stream redesign | NTP-plus-absolute-seek into a preloaded file. YouTube gives no sample-accurate position and no bounded seek. Server audience mixing needs the server to hold the music. |
| **Agora / Shengwang** | Lead, chorus, audience roles; chorus members mutually independent; audience gets a mixed stream | 50 ms target, 64 ms achieved. Ear monitoring cut from a typical 100 to 300 ms down to under 50 ms. **Device-side audio alone budgeted at 30 to 200 ms.** "Each chorus end obtains BGM from the local at the same time." **The lead is deliberately delayed to meet the followers** | Two ideas. (a) The lead/chorus/audience role split, which is the shape our singer/listener split already has. (b) Delaying the leader instead of only pulling followers forward, bounded by the room's worst measured offset. Worth an experiment against our current singer-is-the-unmodified-reference rule. (c) The 200 ms cumulative equals "half a word" heuristic as the perceptual bar to encode numerically | `getAudioBufferDelay` on their own media player, `selectMultiAudioTrack` for multi-track files, and OS-level AAudio paths. All require code we do not own on a stack the browser cannot reach. |
| **Tencent RTC** | Lead runs **two SDK instances** (vocals + accompaniment); a `userId_mix` robot mixes everything; audience pulls one stream | NTP calibration returns a **tri-state: 0 = success within 30 ms, 1 = success but possibly over 30 ms, -1 = failed**. Lead sends a custom command (explicitly not SEI) with music id and an agreed future start time **T2 = now + N seconds**; every client preloads and starts on schedule. Ongoing: seek when estimated vs actual position differ by more than **50 ms**, "a typical value, adjustable to the tolerance of the business". Karaoke listening budget quoted separately as under 300 ms | **The T2 pre-roll countdown** (highest-value idea in the survey). Tri-state clock confidence. Periodic re-signal for latecomers with an idempotence rule ("after the first startChorus, no longer respond"). Pre-flight network speed test before room entry. The double-BGM trap and its `muteRemoteAudio` fix, which maps onto our mic-picks-up-speaker hazard | Their NTP service is a vendor primitive. We do not need it: the PartyKit Durable Object is already a single authoritative clock shared by exactly the clients that matter, which is a stronger guarantee than syncing to a public pool. Port the T2 pattern onto our existing clock, not the NTP. |
| **BytePlus** | Server-mixed KTV | Wired-headphone in-ear monitoring is written into the feature description. Caps at 50 visible users, 30 with mics live | The scale bound as a design ceiling reference | Server mixing, owned catalog. |

**Where mixing happens: our choice is the mainstream one.** No vendor server-mixes for active participants. Server mixing appears in exactly two places, the passive audience downlink and the recorded artifact. Every product mixes the singer's own monitor locally because ear monitoring cannot survive a round trip. Our "no server mixing, all listening volumes local" is what Zego and Agora converged on independently for the participant path, and per-user local volume is a feature server mixing would destroy. This should be written down as an explicit non-goal, because it will be re-litigated.

Sources: [ZEGOCLOUD, Online Karaoke Real-Time Chorus](https://www.zegocloud.com/blog/online-karaoke-real-time-chorus); [ZEGOCLOUD, lyric sync, article 4496](https://docs.zegocloud.com/article/4496); [Shengwang/Agora chorus solution, 2021-09-18](https://segmentfault.com/a/1190000040708149/en); [Agora Voice Calling release notes](https://docs.agora.io/en/voice-calling/overview/release-notes); [Agora, set audio route](https://docs.agora.io/en/voice-calling/advanced-features/set-audio-route); [Tencent RTC 57026 song sync](https://trtc.io/document/57026), [57028 lyric sync](https://trtc.io/document/57028), [57032 low-latency capture](https://trtc.io/document/57032), [57036 chorus scheme](https://trtc.io/document/57036), [57039 ear monitoring and NTP issues](https://trtc.io/document/57039), [35078 product overview](https://trtc.io/document/35078); [BytePlus online KTV overview](https://docs.byteplus.com/en/docs/byteplus-vos/docs-online-ktv-solution-overview).

### Open source and adjacent

| Project | Mixing model | Latency strategy | Transfers to us | Cannot transfer, and why |
| --- | --- | --- | --- | --- |
| **UltraStar Deluxe** (Pascal, 2007 to date) | Local playback, local mic | Two user-facing sliders: A/V delay and mic delay. Calibration by tone detection | The whole failure catalogue below: reported latency undercounts real latency, latency varies with CPU frequency on one machine, calibration tones get false-positived by ambient noise and driver-level AEC | Native audio device access. |
| **UltraStar Play** (Unity, 2018 to date) | Local playback + **networked mic via a Companion App over WLAN** | Auto-calibration using **three different frequencies**, adopted specifically "to make it more resilient to false detection caused by noise and issues caused by input signal filters" | The three-tone calibration design, and the fact that two projects reached it independently after single-tone failed | Unity audio internals. |
| **Performous** (C++, 2006 to date) | Local, multi-mic | Latency calibration issue open since 2012-11-18 and still open | The schedule warning: this is not a weekend feature | n/a |
| **Karaoke Eternal** | Browser player + phone remotes | Explicitly **rejected** server-side mixing and mic streaming | Our strongest external validation for the no-server-mixing call in a browser context | n/a |
| **WatchParty** (YouTube IFrame + WebRTC) | n/a | Rate nudge against a broadcast host position, in production, with its own constants | Direct precedent for `computeSyncAction`; a place to sanity-check our thresholds against a second implementation | n/a |
| **Jellyfin SyncPlay** | n/a | Shipped rate-nudge constants, with code comments admitting rate nudging fails on music content and on Safari and Android | The admission itself: rate nudging is more audible on music than on speech, which is our entire content type | n/a |

Sources: [USDX #577, 2021-04-14](https://github.com/UltraStar-Deluxe/USDX/issues/577); [USDX #1017, 2025-07 to 2025-09](https://github.com/UltraStar-Deluxe/USDX/issues/1017); [UltraStar Play #323, 2022-08-28](https://github.com/UltraStar-Deluxe/Play/issues/323); Performous #6, 2012-11-18.

---

## 2. Patterns worth adopting, ranked

Effort guesses are for one engineer, implementation plus tests, assuming no product design round.

### 1. T2 pre-roll: agree on a future start time instead of starting now (2 to 3 days)

Every vendor with a published design does this. Tencent's is explicit: the lead sends a one-shot command carrying music id and `T2 = now + N seconds`; every client preloads against T2 and starts on schedule.

We have no pre-roll. The singer hits play and everyone else chases from behind through drift correction, so the room is out of sync at t=0 by construction and only converges afterwards. Their clients are already in sync at t=0.

Maps to: add a `startAt` wall-time to the video-state protocol; clients call `loadVideoById` then `pauseVideo` then `seekTo(0)`, and schedule `playVideo()` against `estimatedServerNow` from `src/hooks/usePartyClock.ts`. Additive protocol change, safe in either deploy order (old clients ignore the field). This is the single largest accuracy win available and it is proven by three independent vendors.

### 2. Name and defend the double-audio invariant (0.5 day to document, 1 to 2 days to test)

Tencent documents the trap in the chorus scheme: the lead must `muteRemoteAudio(true)` against the accompaniment instance, "otherwise the local and remote accompaniment music will be played repeatedly".

We have the structurally identical hazard from the other direction. If a singer on laptop speakers has their mic pick up the YouTube audio and republish it over LiveKit, every listener hears the song twice, offset by the RTT. Our only defence today is an unstated headphone assumption plus whatever noise cancellation happens to do, and it is weakest in `micMode: "raw"`, which is exactly the mode a singer who cares about their voice will pick.

Maps to: an explicit invariant in `docs/design/AUDIO-ARCHITECTURE.md`, plus scenarios D1 to D3 below. Consider making `micMode: "raw"` conditional on a detected headphone route.

### 3. Instrument the latency budget before tuning anything (2 to 4 days)

We are optimising numbers we have never measured. Published bars, with the reframing that matters most:

- Under 80 ms (Zego) and 50 to 64 ms (Agora) are the **simultaneous-singing** budgets. They apply to chorus, where two people sing at once.
- Under 300 ms (Tencent) is the **listening** budget.
- Device-side capture plus playback alone is 30 to 200 ms on **native** SDKs (Agora), before any network.

Our product is one singer at a time with passive listeners, so our applicable bar is Tencent's 300 ms class, not Agora's 64 ms. We will not hit 50 ms in a browser over Bluetooth, and no shipped product does either. Jeff Kaufman measured a 2016 MacBook on OSX 11.1 (2021-02-02): Chrome about 67 ms and Firefox about 55 ms end-to-end at defaults, dropping to about 19 ms and 14 ms with `latencyHint: 0` and AEC, noise suppression and AGC disabled. That tradeoff is exactly what our `micMode: "voice" | "raw"` encodes.

Maps to: measure and record singer-mouth-to-listener-ear, and device-side capture-plus-playback with no network. Then check whether `LATENCY_MAX_MS = 800` in `src/lib/syncMath.ts` should be a user-visible warning rather than a value silently absorbed by `useAutoSyncOffset`. 800 ms is beyond even Tencent's loose bar.

Source: [Jeff Kaufman, Browser Audio Latency, 2021-02-02](https://jefftkaufman.substack.com/p/browser-audio-latency). Note his other finding, which kills the cheap shortcut: "there is not yet any way to ask a browser how much end-to-end latency there is." `MediaTrackSettings.latency` is Chrome-only and returned a constant 10 ms regardless of the actual mic; `AudioContext.outputLatency` is Firefox-only and returned less than half the real figure.

### 4. Expose clock-sync confidence (1 day)

Tencent surfaces a tri-state calibration result (0 within 30 ms, 1 possibly worse, -1 failed) plus a documented "result maybe inaccurate" warning attributed to "poor client network environment and continuous rtt jitter".

`usePartyClock` computes a median-of-min-RTT offset and exposes no confidence at all. `MAX_RTT_MS = 2500` and `MIN_SAMPLES_FOR_SYNC = 2` are silent gates: a client on a bad link either syncs badly or does not sync, and neither the user nor QA can distinguish those outcomes. Cheap change that converts an invisible failure into a diagnosable one.

### 5. Acoustic-loopback latency calibration, automatic with a manual fallback (3 to 5 days, plus a long tail)

The shipped shape is consistent across Smule (4 Hz pulse train, 250 ms period, peak detection), BandLab ("hold your headphones to your mic, do not wear them", Automatic with Manual "only if the automatic test fails"), StarMaker (AUTO-ADJUST, 10 to 15 s), and UltraStar.

Design constraints, all learned the hard way by others, all mandatory:

- **Three distinct tones, not one.** UltraStar Play adopted three frequencies for resilience against noise and input filters; UltraStar Deluxe independently landed on three notes of 900 ms each, "very sharply cut off to avoid any transition delays" (a ramped attack biases the onset estimate late).
- **Report failure rather than a wrong number.** Keyboard clicks, desk taps and dragging the mic all registered as valid detections in USDX. Some laptop drivers run echo cancellation at driver level and eat the tone entirely.
- **Always keep the manual escape hatch.** Smule's Vocal Match Slider shifts a few hundred ms either way; BandLab's Manual entry exists precisely for automatic-test failure. We already have `SyncOffsetControl` and `useAutoSyncOffset`; the calibration flow seeds them, it does not replace them.
- **Invalidate on route change.** StarMaker uses unplug/replug as the calibration trigger. A stored offset keyed to a device is wrong the moment the route changes.

### 6. Gate ear monitoring on route, do not merely warn (1 day)

Universal feature, universal caveat. Tencent: "Bluetooth headsets exhibit substantial hardware delays, making wired headphones the recommended solution. The SDK disables this feature on devices with poor performance." BytePlus writes "with wired headphones" into the feature description. Smule goes furthest: Bluetooth is unsupported, hidden from the mic input selector, and there is **no real-time voice monitoring over Bluetooth at all**, "you'll only hear the music in your headphones". KaraFun prefers cabled.

We already have the detection half in `src/lib/audioRoutes.ts` (`isBluetoothLabel`, `hasBluetoothRoute`). The vendor-validated move is to let that predicate **disable** monitoring, not warn about it, and to show an explicit degraded-mode banner rather than let quality collapse silently. This corroborates `docs/plans/2026-08-17-bluetooth-hfp-research.md`.

Note also Kaufman's finding that Bluetooth headsets "report much lower latencies than they actually implement", which means a Bluetooth route poisons any calibration that trusts device-reported numbers.

### 7. Route-change policy: pick a behaviour and make it explicit (1 to 2 days)

Smule auto-pauses the recording on a mid-session input change and sometimes requires a restart. Agora's rules: `onAudioRouteChanged` fires on every change, the last-connected device wins when several are attached, unplug falls back to the scenario default, and **user behaviour has the highest priority, above any API call**, so prefer the steady `setDefaultAudioRouteToSpeakerphone` over transient calls.

Our `devicechange` subscription in `useAudioDevices` re-enumerates and nothing pauses the turn. That may be the right call for a social room, but it should be a decision with a test behind it rather than a default.

### 8. Pre-flight network gate (1 to 2 days)

Tencent runs a speed test with expected bandwidth parameters (10 to 5000 kbps up and down) to identify inadequate networks **prior to room entry**. Zego states plainly that some users' devices and connections simply cannot do real-time chorus. We have no gate, so a user on a bad link discovers it while singing.

### 9. Tighten the progress cadence, or know why not (0.5 to 2 days)

Tencent sends lyric progress at about 200 ms, Zego caps SEI at 30 per second. Ours is 2000 ms. `useVideoSync` corrects at about 300 ms but against a state snapshot up to 2 s old, so our extrapolation across `estimatedServerNow - wallTime` is doing roughly 10x more work than theirs. This is a cost question rather than a correctness one, but it is worth recording that we are an order of magnitude slower than the prior art.

Note Tencent's own split, which maps cleanly onto ours: reliable one-shot commands for the start signal (they explicitly avoid SEI for it), media-locked high-rate messages for progress. Our `video-state` is the progress stream and a future `startAt` would be our one-shot.

### 10. Borrowed UX details, cheap and individually small (0.5 day each)

- "Reduce reverb" as a first-line echo remedy (Smule). Wet tail re-entering the mic is a real cause. Consider capping wet when no headphone route is detected.
- A noise gate specifically to stop a remote singer's voice leaking from a listener's headphones back into their own mic. Smule shipped one for exactly this, and calls the symptom "vocal doubling".
- "Sing in time with the backing track, not with the other person's voice" as literal on-screen instruction. This is Smule's documented product answer to unavoidable asymmetric latency, and the patent argues lagged vocals "need not psychoacoustically interfere".
- Dual-notification on roster changes (Tencent fires both a full seat list and a per-seat delta) so the UI does not have to diff full-state broadcasts to answer "who just left the mic".

---

## 3. Anti-patterns and dead ends

**Serial chorus (each singer records on top of the previous one).** WeSing's entire RT-ONE rewrite existed to kill this design's accumulated latency; Agora notes serial designs could not scale past three participants at all. Never build sync by chaining.

**Routing the music through the voice channel.** Agora's pre-chorus design had followers hearing the lead with double network transit, 200 ms or more cumulative, which is Agora's own "half a word" of lag. All three vendors moved the music to local playback. We start where they ended up; do not regress toward it under pressure to "just stream the audio".

**Trusting browser-reported latency numbers.** No browser exposes true end-to-end latency (Kaufman, 2021). Chrome's `MediaTrackSettings.latency` returned a constant 10 ms for every mic. Bluetooth devices under-report. UltraStar hit the same wall natively: on macOS Big Sur the reported 4.56 ms playback plus 10 ms input summed to 14.56 ms while the setting that actually worked was over 60 ms, about 45 ms unaccounted for. The corollary from USDX #1017 is precise and worth internalising: they timed from `.Play` with a tick counter rather than from the first sample reaching the driver, and samples are handed over on the next sound-card interrupt, so the gap is not even constant. Measure round trips; never sum reported figures.

**Treating measured latency as a per-machine constant.** USDX found CPU frequency scaling has "a massive influence", with laptops ranging 0.4 to 5 GHz and latency roughly linear in clock speed, and a plausible mechanism where adding mics raises power draw, lowers the clock, and raises per-mic latency. A calibration taken on a plugged-in cold laptop does not describe the same laptop throttled at 40% battery.

**Single-tone calibration.** Failed independently in two projects. Keyboard clicks, desk taps and mic handling all false-positived; driver-level AEC ate the tone; mic boost behaved binary. Three tones with sharp cutoffs, and an honest failure result.

**Trusting a player's reported position.** UltraStar Play #323 (2022-08-28): Unity was told to seek to 11306 ms, reported back 11306 ms, and audibly played about 2 seconds further in, caused by VBR mp3. Related: intermittent lyric desync "more consistent on fresh boot" (#510). `player.getCurrentTime()` on the YouTube IFrame API is exactly this class of API and it is our only ground truth.

**Assuming the reported position is the position of the sound leaving the speaker.** Agora shipped `getAudioBufferDelay` on their own media player specifically because "the main vocal and background accompaniment may be out of sync in karaoke scenarios". YouTube exposes no equivalent. Our whole drift loop measures `target - player.getCurrentTime()`, which is the decode position, not the output position, and the gap between them is unknown, device-dependent and unretrievable. **This is a structural floor on our accuracy that no amount of tuning `DEAD_ZONE_S` will penetrate.** Record it as a known-unmeasurable so nobody spends a week tuning against it.

**Rate nudging as if it were free.** Jellyfin SyncPlay's own code comments concede rate nudging is problematic on music content and on Safari and Android. Music is 100% of our content. Our `NUDGE_UP = 1.05` / `NUDGE_DOWN = 0.95` is a 5% pitch shift while active; the hysteresis (`PERSIST_DRIFT_S = 0.35`, `PERSIST_TICKS = 8`) is what keeps it from being constantly audible, and that hysteresis is load-bearing.

**Letting the session die when the host leaves.** Smule Sing Live sessions terminate with no admin present; Tencent dissolves the room and clears the song queue when the host leaves. For a friends-in-a-room product this is the anti-pattern, and our `ADMIN_GRACE_MS` succession is the right call. Keep it, and test it.

**Server-side mixing for active participants.** Nobody does it, including us. It would also destroy per-user local volume (`volumeModel.ts`), which is a real feature. Documented here as an explicit non-goal so the question stops recurring.

**Shipping alignment features before measuring.** Performous has had its latency calibration issue open since 2012-11-18. UltraStar has been iterating on two delay sliders for over a decade. This problem absorbs unbounded effort; gate it behind the measurements in recommendation 3.

---

## 4. SCENARIOS

Flat list, phrased as test-matrix rows, ready to merge into `docs/qa/AUDIO-TEST-MATRIX.md`. Each traces to a documented handled case or a documented bug class in the sources above.

**Clock and sync**

- S1. Drift exceeds `DEAD_ZONE_S` on a follower: assert correction is a rate nudge and no seek occurs below `SEEK_THRESHOLD_S`. (Smule US11310538B2 50 ms threshold; Tencent 57026 50 ms.)
- S2. Drift parked between `DEAD_ZONE_S` (50 ms) and `PERSIST_DRIFT_S` (350 ms) for fewer than `PERSIST_TICKS`: assert no seek, and confirm the residual drift is deliberate rather than audible. Vendors seek at 50 ms; we do not.
- S3. Follower joins mid-song at t+90s: assert convergence to within `DEAD_ZONE_S`, record time-to-converge, and assert no visible seek storm. (Tencent periodic re-signalling, 57026.)
- S4. Duplicate or replayed `video-state` for the same `videoId:loadedAt`: assert no double load and no double seek. (Tencent idempotence rule, "after the first startChorus, no longer respond".)
- S5. Clock offset step-changes mid-song (client sleep/wake, network path change): assert the rate nudge absorbs it rather than triggering a seek storm.
- S6. Sustained RTT jitter above 30 ms: assert the offset estimate stays stable and does not oscillate the drift loop. (Tencent 57039 "continuous rtt jitter".)
- S7. `MIN_SAMPLES_FOR_SYNC` unmet, or every RTT above `MAX_RTT_MS`: assert the client shows a degraded-sync state rather than syncing on garbage. (Tencent tri-state NTP result.)
- S8. Clock offset not yet converged at join: assert `computeStartSeconds` takes the unsynced-clock branch and commits nothing rather than a bad target.
- S9. Sustained 200 ms follower offset: assert it is detectable in a two-client Playwright run against `__ytStub`. 200 ms is Agora's "half a word" perceptual bar and should become a numeric assertion.
- S10. Singer's device stalls or rebuffers: assert `stalled: true` re-arms the 10 s timer without re-stamping position, and the room does not pause.
- S11. Singer backgrounds the phone: assert `visibilitychange` pause, clock handed back, resume on return.
- S12. Singer's `video-sync` stream dies: assert the 10 s stall timer pauses the room, broadcasts `video-state`, and posts the system chat line.
- S13. After `seekTo`, `player.getCurrentTime()` is not trusted until it has advanced monotonically across N polls. (UltraStar Play #323: player reported the requested position while audibly playing 2 s further in.)
- S14. First song after a cold start: assert sync converges as on a warm player. (UltraStar Play #510, desync "more consistent on fresh boot".)
- S15. Per-user manual sync offset survives a reconnect and a singer change; assert the EMA resets on singer change, since each singer is a different path.
- S16. First-sample rule: with no jitter delta present, assert `useAutoSyncOffset` commits nothing.

**Latency budget**

- S17. Measure end-to-end singer-mouth to listener-ear latency. Bars: under 80 ms is chorus-capable (Zego), under 300 ms is karaoke-acceptable (Tencent). Expect band two; the test exists to catch regression past it.
- S18. Measure device-side capture plus playback with no network. Vendor budget is 30 to 200 ms on native (Agora). Establishes how much of our total is unfixable on web.
- S19. Voice-latency estimate reaches `LATENCY_MAX_MS` (800 ms): assert a user-visible signal rather than silent absorption.
- S20. `micMode: "voice"` vs `"raw"`: assert the 3A toggle measurably changes monitoring latency. Reference floor is about 55 to 67 ms at browser defaults, about 14 to 19 ms optimised.

**Double audio and feedback**

- S21. Singer on laptop speakers with no headphones: assert listeners do not hear the YouTube audio re-published through the singer's mic. (Tencent double-BGM trap, 57036.)
- S22. Same as S21 with `micMode: "raw"`: the worst case, since noise cancellation is our only implicit defence.
- S23. Mic check active during a live turn: assert no feedback loop between the singer's local player audio and their monitored mic, and assert the `stopSinging` ordering rule holds.
- S24. Speakers instead of headphones with a hot mic: assert the feedback warning path fires. Every vendor's shipped answer is "wear headphones".
- S25. High reverb wet plus speaker output: assert the wet/dry clamp holds, and evaluate a wet cap when no headphone route is detected. (Smule lists reducing reverb as a first-line echo remedy.)
- S26. Remote singer's voice leaking from a listener's headphones back into that listener's mic while they talk: assert `voice` mode suppresses it. (Smule shipped a noise gate for exactly this.)

**Device and route**

- S27. Wired headset plugged in mid-turn: assert the published track survives, or that we deliberately pause. Smule pauses; we currently do not. Decide, then test the decision.
- S28. Wired headset unplugged mid-turn: assert route falls back to built-in, no howl through the speaker, mic still publishing.
- S29. Two outputs connected and the second disconnects: assert deterministic fallback. (Agora: last connected wins; unplug falls back to the scenario default.)
- S30. Bluetooth headset connects mid-turn: assert an explicit degraded-mode warning fires from `hasBluetoothRoute`, and that ear monitoring is disabled rather than merely flagged. (Tencent auto-disables; Smule ships zero monitoring over Bluetooth.)
- S31. Bluetooth-only route at `startSinging`: assert the capture profile chooses a built-in input where one exists (`findBuiltInInputId`).
- S32. USB-C audio interface attached: assert a deterministic default input. (Smule pins Input 1.)
- S33. `devicechange` fires with a stale remembered `deviceId`: assert `getUserMedia` does not throw on a stale exact constraint.
- S34. Route change during an active mic check: assert generation-token cancellation holds and no orphan `AudioContext` survives.
- S35. Low-power or thermally throttled device: assert monitoring degrades gracefully. (Tencent disables the feature on weak devices.)
- S36. `AudioContext` suspended by autoplay policy: assert the `<audio>` element fallback carries the full local mix at correct volume and the iOS `muted` invariant holds.

**Calibration (net-new, borrowed from BandLab, Smule, StarMaker, UltraStar)**

- S37. Acoustic-loopback calibration produces a per-device stored offset that seeds `useAutoSyncOffset` and remains overridable by `SyncOffsetControl`.
- S38. Automatic calibration fails: assert the manual entry path is reachable and clearly offered. (BandLab: Manual "only if the automatic test fails".)
- S39. Calibration under driver-level or browser AEC, noise suppression and AGC: assert it reports failure rather than returning a wrong number. (USDX: driver-level AEC ate the tone.)
- S40. Calibration with typing, desk taps or mic handling as ambient noise: assert no false detection. (USDX #1017: all three false-positived a single-tone routine.)
- S41. Calibration run twice under a CPU-load or throttling fixture: assert the two results are compared, and that a spread beyond tolerance forces re-calibration or a stored range rather than a point. (USDX: latency roughly linear in CPU frequency, 0.4 to 5 GHz range.)
- S42. Calibration over a Bluetooth route: assert the result is rejected or the route is refused. (Bluetooth devices under-report their own latency.)
- S43. Route change after a successful calibration: assert the stored offset is invalidated. (StarMaker uses unplug/replug as the calibration trigger.)
- S44. Assert the calibration tone is multi-frequency with sharp cutoffs, not a single ramped tone. (Adopted independently by UltraStar Play and UltraStar Deluxe after single-tone failed.)

**Mixing and volume**

- S45. Per-person volume set, participant drops off the roster, LiveKit track outlives the socket: assert the gain map keeps the identity and the volume holds across reconnect.
- S46. Duplicate "Anonymous" participants: assert the `personMixKey` `peer:<peerId>` path keeps their volumes independent.
- S47. Singer talks over the music: assert duck node behaviour, and assert the limiter never clips at master 200%.
- S48. Legacy two-slot stored blob (`talk` / `stage`): assert migration on read.

**Session, roles and pre-flight**

- S49. Admin leaves mid-song: assert `ADMIN_GRACE_MS` succession runs and the session survives. (Smule Sing Live and Tencent both kill the room; that is the anti-pattern.)
- S50. Singer times out at 60 s: assert the queue advances and `videoState` is cleared everywhere `currentSingerId` is cleared.
- S51. Two clients race to claim the same turn: assert exactly one wins.
- S52. Admin force-ends a turn while capture is live: assert the `stopSinging` ordering rule against an active mic check holds.
- S53. Pre-flight network check before room entry: assert a user on an inadequate link is told before they sing, not after. (Tencent: 10 to 5000 kbps up/down speed test prior to room entry.)

**Documented as unmeasurable, not testable**

- S54. `player.getCurrentTime()` reports a decode position, not the position of audio leaving the speaker. YouTube exposes no equivalent of Agora's `getAudioBufferDelay`. This is a floor on our achievable sync accuracy. Recorded here so nobody tunes thresholds against it.
