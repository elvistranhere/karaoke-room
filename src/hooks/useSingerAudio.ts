"use client";

import { useCallback } from "react";
import type { RemoteAudioTrack, Room } from "livekit-client";
import { Track } from "livekit-client";
import { VOICE_TRACK_NAME } from "./useLiveKit";

export interface SingerAudioSources {
  // Null while there is no room or no singer, which is how consumers stay idle
  getTrack: (() => MediaStreamTrack | null) | null;
  getStats: (() => Promise<RTCStatsReport | null>) | null;
}

function findSingerVoiceTrack(room: Room, singerIdentity: string | null): MediaStreamTrack | null {
  if (!singerIdentity) return null;

  // Priority 1: the singer's published voice track
  for (const [, participant] of room.remoteParticipants) {
    if (participant.identity !== singerIdentity) continue;
    let unnamed: MediaStreamTrack | null = null;
    for (const [, pub] of participant.trackPublications) {
      if (!pub.track || !pub.isSubscribed || pub.track.kind !== Track.Kind.Audio) continue;
      if (pub.trackName === VOICE_TRACK_NAME) return pub.track.mediaStreamTrack;
      if (!pub.isMuted && !unnamed) unnamed = pub.track.mediaStreamTrack;
    }
    if (unnamed) return unnamed;
  }

  // Priority 2: the local voice track (the singer's own view)
  if (room.localParticipant.identity === singerIdentity) {
    for (const [, pub] of room.localParticipant.trackPublications) {
      if (pub.trackName === VOICE_TRACK_NAME && pub.track) return pub.track.mediaStreamTrack;
    }
  }

  return null;
}

function findSingerRemoteTrack(room: Room, singerIdentity: string): RemoteAudioTrack | undefined {
  // lkIdentity is exact; the display-name fallback only ever matches as a
  // prefix of the real LiveKit identity (e.g. "elvis" vs "elvis-044ef3d6")
  const participant = Array.from(room.remoteParticipants.values()).find(
    (p) => p.identity === singerIdentity || p.identity.startsWith(`${singerIdentity}-`),
  );
  const publications = participant
    ? Array.from(participant.audioTrackPublications.values())
    : [];
  // The singer also has a muted managed mic; measure the real voice track
  const publication = publications.find((pub) => pub.trackName === VOICE_TRACK_NAME && pub.track)
    ?? publications.find((pub) => pub.track);
  return publication?.track as RemoteAudioTrack | undefined;
}

// The only place that reaches into the LiveKit room for the singer's audio. Components
// and the offset estimator take these callbacks instead of the Room itself.
export function useSingerAudio(room: Room | null, singerIdentity: string | null): SingerAudioSources {
  const getTrack = useCallback(
    () => (room ? findSingerVoiceTrack(room, singerIdentity) : null),
    [room, singerIdentity],
  );

  const getStats = useCallback(async (): Promise<RTCStatsReport | null> => {
    if (!room || !singerIdentity) return null;
    const track = findSingerRemoteTrack(room, singerIdentity);
    if (!track?.getRTCStatsReport) return null;
    try {
      return (await track.getRTCStatsReport()) ?? null;
    } catch {
      return null;
    }
  }, [room, singerIdentity]);

  return {
    getTrack: room ? getTrack : null,
    getStats: room && singerIdentity ? getStats : null,
  };
}
