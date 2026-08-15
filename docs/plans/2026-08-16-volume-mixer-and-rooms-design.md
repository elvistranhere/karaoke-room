# Discord-style Volume Mixer + Rooms and Admin Lifecycle

Two tracks designed together on 2026-08-16. Owner decisions locked: 0-200 sliders (music capped 0-100), rooms private by default, skip-singer ships behind a confirm.

## Track 1: Volume mixer

Problem: three slider ranges existed for one concept, and two sliders multiplied for the same person, so no displayed number matched what you heard. Boost was a special mode that only worked for the current singer.

Design, in Discord's shape:

- One Web Audio mixer (`src/lib/voiceMixer.ts`) for every remote voice: source, personGain, master bus, soft limiter, destination. Audio elements stay attached at volume 0 purely as WebRTC pumps. Boost is therefore real for everyone, and the dual element/WebAudio path is gone.
- What you hear = master x person value. Exactly two layers, never three.
- Per person, two remembered values, talk and stage, SWITCHED by whether that person is the current singer, never multiplied. Karaoke needs the split (singing runs 10-20dB hotter than chatting); switching keeps the visible number equal to the audible gain. The PeoplePanel row and the stage Voice slider edit the same active value.
- Music = musicSlider x min(master, 1). YouTube hard-caps its player at 100; the UI says so when master exceeds 100 instead of faking a dead slider zone.
- Self controls in the toolbar: mic mute plus deafen (master 0 + player 0 + mic mute, snapshot restored). Deafen is broadcast as `ParticipantStatus.isDeafened` and badged; it is presence, not remote control.
- The singer keeps no self-output gain, enforced by construction (the mixer only builds chains for subscribed remote tracks). Mute All survives, relabeled "Mute all mics", outside the volume cluster: it stops publishing, a different job from local muting.
- Mic-check hush becomes a mixer-level duck instead of the savedVolume dataset dance.

## Track 2: Rooms and admin lifecycle

The March plan (2026-03-30) was ~80% shipped. This completes it and fixes four confirmed defects: succession lost the room on a browser refresh, quiet rooms vanished from /browse after the 2-minute registry expiry, the browse card's current song was usually stale, and the registry accepted unauthenticated writes.

- `roomName` and `isPublic` become admin-owned RoomState fields, settable at creation and later. Name shows in the room header and on browse cards, sanitized server-side.
- Private by default: rooms reach the registry only when the admin enables "Show in Browse".
- Registry gains the name field, a keepalive tied to the heartbeat so live rooms never expire out of the list, fresher current-song reporting, and a shared write token via PartyKit env (check skipped when the env var is absent, so local dev works).
- Admin succession: on admin disconnect the seat goes vacant for a 45s grace window; a rejoining connection with the same localStorage `clientId` reclaims it (a refresh no longer loses the room), otherwise the earliest remaining joiner inherits. Manual transfer unchanged.
- Kick becomes a `clientId` ban so reopening the URL does not defeat it.
- New admin powers: room rename, listing toggle, remove-from-queue, and skip-singer (confirm dialog, announced in chat, clears the same state as the natural turn-end paths). Queue reordering deferred.
- All protocol changes additive; PartyKit deploys before Vercel as usual.
