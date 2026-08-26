# Karaoke Now - Sing Together Online

[![Vercel](https://github.com/vietbrosinaus/karaoke-now/actions/workflows/health-vercel.yml/badge.svg)](https://github.com/vietbrosinaus/karaoke-now/actions/workflows/health-vercel.yml)
[![PartyKit](https://github.com/vietbrosinaus/karaoke-now/actions/workflows/health-partykit.yml/badge.svg)](https://github.com/vietbrosinaus/karaoke-now/actions/workflows/health-partykit.yml)
[![Upstash](https://github.com/vietbrosinaus/karaoke-now/actions/workflows/health-upstash.yml/badge.svg)](https://github.com/vietbrosinaus/karaoke-now/actions/workflows/health-upstash.yml)
[![LiveKit](https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Felvistranhere%2F9578abf10f65c07ec2e82f6e272255b3%2Fraw%2Flivekit-health.json)](https://github.com/vietbrosinaus/karaoke-now/actions/workflows/health-livekit.yml)
[![Deploy PartyKit](https://github.com/vietbrosinaus/karaoke-now/actions/workflows/deploy-partykit.yml/badge.svg)](https://github.com/vietbrosinaus/karaoke-now/actions/workflows/deploy-partykit.yml)

Real-time online karaoke rooms. Join with a code, put a YouTube video on stage, and sing with friends.

## Stack

- **Frontend**: Next.js 15, React, Tailwind CSS, TypeScript
- **Audio**: LiveKit SFU (WebRTC), Web Audio API
- **Signaling**: PartyKit (Cloudflare Durable Objects)
- **Deploy**: Vercel + PartyKit Cloud

## Features

- Create/join rooms with a 6-character code
- Queue system - take turns singing
- Synced YouTube playback - the singer picks a link, every client plays it locally in step
- Voice-only LiveKit publish, so the singer hears their music with zero encode latency
- Automatic per-listener voice sync: the music is delayed to match the incoming voice
- Voice effects: Hall reverb, Echo, Warm, Bright, Chorus (pure Web Audio API)
- Per-person volume control
- Audio-reactive ambient glow
- Real-time chat + emoji reactions with sound effects
- Works in any modern browser, desktop or mobile
- Heartbeat-based connection management

## Getting Started

```bash
npm install
cp .env.example .env  # add your LiveKit + PartyKit credentials
npm run dev
```

## Environment Variables

```
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
LIVEKIT_URL=wss://your-project.livekit.cloud
NEXT_PUBLIC_LIVEKIT_URL=wss://your-project.livekit.cloud
NEXT_PUBLIC_PARTY_HOST=your-project.partykit.dev
```

### PartyKit secrets

The public room listing is write-gated on a shared token. Set it once per deployed
project, before `npm run deploy:party`:

```bash
partykit env add REGISTRY_TOKEN   # any long random string
```

Without it, a deployed registry rejects every write and `/browse` stays empty. Local
dev needs nothing: writes from `localhost` are exempt.

## Architecture

```
Browser A (Singer)                       Browser B (Listener)
  |-- getUserMedia (mic)                   |-- Receives the singer's voice track
  |    mic -> effects -> gain --+          |-- Own YouTube IFrame player
  |                             |          |-- Auto voice-sync offset
  |                             +-> voice track -> LiveKit SFU
  |-- Own YouTube IFrame player (clock authority)
  |     video-load / video-sync -> PartyKit -> video-state -> every client
  +-- PartyKit (room state, chat, queue, clock sync)
```

Only voice travels over LiveKit. Each client plays the same YouTube video locally
and corrects drift against the server-stamped `wallTime` in `video-state`, so the
singer never hears their own music delayed.
