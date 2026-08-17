"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useRoomState } from "~/hooks/useRoomState";
import { useLiveKit, MIC_ON_PREF_KEY } from "~/hooks/useLiveKit";
import { useAudioDevices } from "~/hooks/useAudioDevices";
import { useYouTubePlayer } from "~/hooks/useYouTubePlayer";
import { useVideoSync } from "~/hooks/useVideoSync";
import { useWakeLock } from "~/hooks/useWakeLock";
import { Bluetooth, Check, LoaderCircle, LogOut, MicOff, Pencil, Settings as SettingsIcon, Volume2, WifiOff, X } from "lucide-react";
import { resolveCaptureProfile } from "~/lib/audioProfile";
import { detectBrowser, type BrowserInfo } from "~/lib/browser";
import { StageAnnouncement } from "./StageAnnouncement";
import { StageBanner } from "./StageBanner";
import { Toolbar, type NoiseCancellationMode } from "./Toolbar";
import { PeoplePanel } from "./PeoplePanel";
import { QueuePanel } from "./QueuePanel";
import { ChatPanel } from "./ChatPanel";
import { RoomShell } from "./RoomShell";
import type { RoomPanel } from "./panels";
import { InviteCode } from "./InviteCode";
import { SettingsDrawer } from "./SettingsDrawer";
import { SoundProfileModal } from "./SoundProfileModal";
import { VideoStage } from "./VideoStage";
import { VideoProgress } from "./VideoProgress";
import { SYNC_AUTO_STORAGE_KEY, SYNC_OFFSET_MAX_MS, readStoredSyncOffset, readStoredSyncAuto, readStoredSyncOffsetFor, storeSyncOffsetFor } from "./SyncOffsetControl";
import { useAutoSyncOffset } from "~/hooks/useAutoSyncOffset";
import { useSingerAudio } from "~/hooks/useSingerAudio";
import { useVolumeMix } from "~/hooks/useVolumeMix";
import { DEFAULT_PERSON_MIX, personMixKey } from "~/lib/volumeModel";
import { playReactionSound } from "./ReactionBar";
import { startSilentUnlock, stopSilentUnlock } from "~/lib/silentUnlock";
import { chatNameColor } from "~/lib/chatColors";
import { readPref, readSessionPref, removeSessionPref, writePref, writeSessionPref } from "~/lib/prefs";
import { analyticsEnabled, chatLengthBucket, markRoomVisited, track, type TurnEndReason } from "~/lib/analytics";
import { useAtmosphere } from "~/hooks/useAtmosphere";
import { DIVIDER } from "~/lib/surfaces";
import { AuthModal } from "./AuthModal";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";

const API_WAIT_MS = 5000;
const BT_NOTICE_KEY = "karaoke-bt-notice-dismissed";
const DEFAULT_TITLE = "Karaoke Now | Sing Together Online";

// Written by the create card on the home page. Same sessionStorage handoff the room name,
// password and listing choice already use.
function wasCreatedHere(roomCode: string): boolean {
  return readSessionPref(`room-creator-${roomCode}`) === "1";
}

interface RoomViewProps {
  roomCode: string;
  playerName: string;
  onRename?: (newName: string) => void;
  onNameRejected?: (info: { name: string; suggestions: string[] }) => void;
}

export function RoomView({ roomCode, playerName, onRename, onNameRejected }: RoomViewProps) {
  const router = useRouter();
  const [browser] = useState<BrowserInfo>(() =>
    typeof window !== "undefined"
      ? detectBrowser()
      : { name: "Unknown", isChromium: true, isMobile: false }
  );

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsFocusRoomName, setSettingsFocusRoomName] = useState(false);
  // Holds the singer the confirm dialog targets, so the dialog closes itself if that
  // singer leaves the stage before the admin confirms
  const [skipTargetId, setSkipTargetId] = useState<string | null>(null);
  const [soundProfileOpen, setSoundProfileOpen] = useState(false);
  const [noiseCancellationMode, setNoiseCancellationModeState] = useState<NoiseCancellationMode>(() => {
    const saved = readPref("karaoke-nc-mode");
    return saved === "on" || saved === "off" || saved === "auto" ? saved : "auto";
  });
  const setNoiseCancellationMode = useCallback((mode: NoiseCancellationMode) => {
    setNoiseCancellationModeState(mode);
    writePref("karaoke-nc-mode", mode);
  }, []);
  const talkingNC = noiseCancellationMode !== "off";
  const singingNC = noiseCancellationMode === "on";
  const authAutoSubmittedRef = useRef(false);
  // Set by the join click: the chime and the mic both wait on that gesture
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [micOnJoinPending, setMicOnJoinPending] = useState(false);

  const {
    roomState,
    myPeerId,
    isConnected: isPartyConnected,
    joinQueue,
    leaveQueue,
    finishSinging,
    isMyTurn,
    sendChat,
    sendStatusUpdate,
    sendReaction,
    sendVideoLoad,
    sendVideoSync,
    videoRef,
    serverOffsetRef,
    clockSyncedRef,
    nameTaken,
    clearNameTaken,
    chatMessages,
    floatingChatMessages,
    participantStatus,
    reactions,
    kicked,
    authRequired,
    authFailed,
    sendKick,
    sendTransferAdmin,
    sendSetPassword,
    sendAuth,
    sendSetRoomName,
    sendSetPublic,
    sendRemoveFromQueue,
    sendSkipSinger,
  } = useRoomState({ roomCode, playerName });

  const isAdmin = myPeerId !== null && roomState.adminPeerId === myPeerId;

  const {
    inputDevices,
    outputDevices,
    selectedInputId,
    selectedOutputId,
    setSelectedInputId,
    setSelectedOutputId,
    micMode,
    setMicMode,
    bluetoothDetected,
    builtInInputDeviceId,
    refreshDevices,
    // The label probe is a capture, so it waits for the join gesture and for the join's
    // own mic decision: a room joined mic-on opens a capture in the same commit, and on
    // iOS a second getUserMedia for the same media type mutes the first track. Once that
    // mic is open the probe is redundant anyway, and enumerateDevices reads real labels.
  } = useAudioDevices({ armed: audioUnlocked && !micOnJoinPending });

  const [btNoticeDismissed, setBtNoticeDismissed] = useState(() => readSessionPref(BT_NOTICE_KEY) === "1");
  const dismissBtNotice = useCallback(() => {
    setBtNoticeDismissed(true);
    writeSessionPref(BT_NOTICE_KEY, "1");
  }, []);

  const {
    room,
    isConnected: isLiveKitConnected,
    error: liveKitError,
    isMicEnabled,
    toggleMic,
    setMicMuted,
    micCheckState,
    micStopped,
    restartMic,
    voicePlaybackBlocked,
    resumeVoicePlayback,
    startTalkingMicCheck,
    startSingingMicCheck,
    stopMicCheck,
    mixer,
    singingError,
    activeSpeakers,
    voiceEffect,
    setVoiceEffect,
    effectWetDry,
    setEffectWetDry,
  } = useLiveKit({
    roomCode,
    playerName,
    isMyTurn,
    selectedInputDeviceId: selectedInputId,
    builtInInputDeviceId,
    selectedOutputDeviceId: selectedOutputId,
    micMode,
    talkingNC,
    singingNC,
    audioUnlocked,
  });

  const [songName, setSongName] = useState<string | null>(null);
  const [syncOffsetMs, setSyncOffsetMs] = useState(readStoredSyncOffset);
  const [syncOffsetAuto, setSyncOffsetAuto] = useState(readStoredSyncAuto);
  const syncOffsetMsRef = useRef(syncOffsetMs);

  const singerIdentity = roomState.currentSingerId
    ? participantStatus[roomState.currentSingerId]?.lkIdentity
      ?? roomState.participants.find((p) => p.id === roomState.currentSingerId)?.name
      ?? null
    : null;
  const singerParticipant = roomState.currentSingerId
    ? roomState.participants.find((p) => p.id === roomState.currentSingerId) ?? null
    : null;
  const singerName = singerParticipant?.name ?? null;
  const singerMixKey = singerParticipant ? personMixKey(singerParticipant) : null;
  const singerNameRef = useRef(singerName);
  singerNameRef.current = singerName;

  // Each singer has their own latency, so the manual offset follows the singer
  useEffect(() => {
    if (singerName) setSyncOffsetMs(readStoredSyncOffsetFor(singerName));
  }, [singerName]);

  const { getTrack: getSingerTrack, getStats: getSingerStats } = useSingerAudio(room, singerIdentity);
  const autoOffsetMs = useAutoSyncOffset(getSingerStats, !isMyTurn && roomState.video !== null);
  useEffect(() => {
    syncOffsetMsRef.current = syncOffsetAuto ? autoOffsetMs : syncOffsetMs;
  }, [syncOffsetAuto, autoOffsetMs, syncOffsetMs]);

  const isMyTurnForPlayerRef = useRef(isMyTurn);
  isMyTurnForPlayerRef.current = isMyTurn;

  // Turn analytics. The reason is set by whichever local control ended the turn; the
  // playback flag is the fallback, and is only written while the stage is this client's,
  // so it still holds the last state of the turn on the render that ends it.
  const turnStartedAtRef = useRef(0);
  const turnEndReasonRef = useRef<TurnEndReason | null>(null);
  const stagePlayingWhileMineRef = useRef(false);
  if (isMyTurn) stagePlayingWhileMineRef.current = roomState.video?.playing ?? false;
  const songNameRef = useRef(songName);
  songNameRef.current = songName;

  // The handle answers with promises, and every caller here ships the position on the
  // wire, so they all want the seconds and the same fallback for a missing player.
  const readPlayerTime = useCallback(async () => (await playerRef.current?.getTime())?.seconds ?? 0, []);

  const handlePlayerStateChange = useCallback((state: number) => {
    if (!isMyTurnForPlayerRef.current) return;
    // 1 = playing, 5 = cued: the video metadata is available in both
    if ((state === 1 || state === 5) && !songNameRef.current) {
      void playerRef.current?.getTitle().then((title) => { if (title) setSongName(title); });
    }
    // The singer is the clock, so a pause the app did not initiate still has to ship.
    // Only while the room believes playback is live: swapping videos also lands in
    // PAUSED, and that position belongs to the video that just left the stage.
    if (state === 1) void readPlayerTime().then((at) => broadcastNowRef.current?.(true, at));
    if (state === 2 && videoRef.current?.playing) {
      void readPlayerTime().then((at) => broadcastNowRef.current?.(false, at));
    }
    if (state === 0) broadcastNowRef.current?.(false, 0);
  }, [videoRef, readPlayerTime]);

  const { mountRef, player, apiReady, ready: playerReady, errorCode: playerErrorCode, embedBlocked, createPlayer } =
    useYouTubePlayer({ onStateChange: handlePlayerStateChange });

  const playerRef = useRef(player);
  playerRef.current = player;

  const { broadcastNow, playbackBlocked } = useVideoSync({
    player,
    video: roomState.video,
    videoRef,
    isSinger: isMyTurn,
    playerReady,
    serverOffsetRef,
    clockSyncedRef,
    syncOffsetMsRef,
    onBroadcast: sendVideoSync,
  });

  const broadcastNowRef = useRef(broadcastNow);
  broadcastNowRef.current = broadcastNow;

  const handleTransportPlay = useCallback(async () => {
    // Play after the video ended restarts it, so broadcast 0 rather than the
    // duration the player still reports
    const ended = (await player.getState()) === 0;
    if (ended) player.seek(0);
    player.play();
    broadcastNow(true, ended ? 0 : await readPlayerTime());
  }, [player, broadcastNow, readPlayerTime]);

  const handleTransportPause = useCallback(async () => {
    player.pause();
    broadcastNow(false, await readPlayerTime());
  }, [player, broadcastNow, readPlayerTime]);

  // The toolbar's NC light reads the same rule the managed capture obeys, so it can
  // never claim a toggle the mic is not on.
  const managedCaptureProfile = resolveCaptureProfile({
    purpose: "managed",
    micMode,
    talkingNC,
    singingNC,
  });

  const micChecking = micCheckState !== "idle" && micCheckState !== "error";

  // The tap is the gesture the room's audio needs, and the only handle on an Android
  // force-fade, which leaves no signal at all: it re-runs the mixer resume, LiveKit's
  // startAudio and the player's own play() from inside a live user activation.
  // play() stays gated on the room believing playback is live, because the singer's
  // player is the room clock: an ungated play() would broadcast a resume to everyone
  // from a control that promises only to fix this device.
  const handleTapToHear = useCallback(() => {
    resumeVoicePlayback();
    if (videoRef.current?.playing) playerRef.current?.play();
    // Reported after the recovery it names, so the report can never be what stops it.
    track("audio_recover_tapped");
  }, [resumeVoicePlayback, videoRef]);

  const {
    master,
    music,
    people,
    deafened,
    volumeControlLost,
    setMaster,
    setMusic,
    setPersonVolume,
    togglePersonMute,
    setDeafened,
    resetPeople,
    resume: resumeMixer,
  } = useVolumeMix({
    mixer,
    player,
    participants: roomState.participants,
    participantStatus,
    micChecking,
  });

  const singerMix = singerMixKey ? people[singerMixKey] ?? DEFAULT_PERSON_MIX : DEFAULT_PERSON_MIX;

  // Level sources, not levels: the meters smooth these at ~13Hz inside the leaf that
  // draws them, so a tick never re-renders the room
  const getMicLevel = useCallback(() => room?.localParticipant.audioLevel ?? 0, [room]);
  const getStageLevel = useCallback(
    () => (room ? Math.max(0, ...Array.from(room.remoteParticipants.values(), (participant) => participant.audioLevel || 0)) : 0),
    [room],
  );

  const handleSyncOffsetChange = useCallback((ms: number) => {
    const clamped = Math.max(0, Math.min(SYNC_OFFSET_MAX_MS, ms));
    setSyncOffsetMs(clamped);
    storeSyncOffsetFor(singerNameRef.current, clamped);
  }, []);

  const handleSyncAutoChange = useCallback((auto: boolean) => {
    setSyncOffsetAuto(auto);
    try {
      window.localStorage.setItem(SYNC_AUTO_STORAGE_KEY, auto ? "on" : "off");
    } catch {
      // storage unavailable, choice still applies for this session
    }
  }, []);

  const handleLoadVideo = useCallback((videoId: string) => {
    setSongName(null);
    sendVideoLoad(videoId);
  }, [sendVideoLoad]);

  // Analytics wrappers. Each one sits on the single call site the UI already used, so the
  // event fires exactly where the user's intent is, never on a server echo of it.
  const handleJoinQueue = useCallback(() => {
    track("queue_joined");
    joinQueue();
  }, [joinQueue]);

  const handleLeaveQueue = useCallback(() => {
    if (isMyTurn) turnEndReasonRef.current = "self";
    leaveQueue();
  }, [leaveQueue, isMyTurn]);

  const handleFinishSinging = useCallback(() => {
    turnEndReasonRef.current = "self";
    finishSinging();
  }, [finishSinging]);

  const handleReact = useCallback((emoji: string) => {
    track("reaction_sent", { emoji });
    sendReaction(emoji);
  }, [sendReaction]);

  // The bucket only: chat text never leaves the room.
  const handleSendChat = useCallback((text: string) => {
    const trimmed = text.trim();
    if (trimmed) track("chat_sent", { length_bucket: chatLengthBucket(trimmed.length) });
    sendChat(text);
  }, [sendChat]);

  // Forward name-taken rejection to parent so it can show the name modal
  useEffect(() => {
    if (!nameTaken) return;
    onNameRejected?.(nameTaken);
    clearNameTaken(); // always clear to prevent re-firing
  }, [nameTaken, onNameRejected, clearNameTaken]);

  // LiveKit identity for status updates - must be before statusCtxRef
  const lkIdentity = room?.localParticipant?.identity ?? null;

  // Play sound when new reactions arrive
  const prevReactionCountRef = useRef(0);
  useEffect(() => {
    if (reactions.length > prevReactionCountRef.current && reactions.length > 0 && !deafened) {
      const latest = reactions[reactions.length - 1]!;
      playReactionSound(latest.emoji, mixer.sfxTarget());
    }
    prevReactionCountRef.current = reactions.length;
  }, [reactions, deafened, mixer]);

  // Deafen force-mutes the mic; the snapshot means undeafening only unmutes
  // people who were unmuted before
  const micWasOnBeforeDeafenRef = useRef(false);
  const handleToggleDeafen = useCallback(() => {
    if (!deafened) {
      micWasOnBeforeDeafenRef.current = isMicEnabled;
      if (isMicEnabled) void setMicMuted(true);
      setDeafened(true);
      return;
    }
    if (micWasOnBeforeDeafenRef.current) void setMicMuted(false);
    micWasOnBeforeDeafenRef.current = false;
    setDeafened(false);
  }, [deafened, isMicEnabled, setMicMuted, setDeafened]);

  // Auto-switch to singing mode ONCE when becoming the singer
  const wasMyTurnRef = useRef(false);
  useEffect(() => {
    if (isMyTurn && !wasMyTurnRef.current) {
      wasMyTurnRef.current = true;
      turnStartedAtRef.current = Date.now();
      turnEndReasonRef.current = null;
      track("turn_started");
      if (micMode === "voice") setMicMode("raw");
    }
    if (!isMyTurn && wasMyTurnRef.current) {
      wasMyTurnRef.current = false;
      // Only the singer's own client reports the turn, so each turn is counted once.
      // The reason is inferred from what this client can see: it set the reason itself,
      // or the server took the stage away. The server disarms its 60s idle timer while
      // the stage video is playing, so a turn cut short mid-song is an admin skip and an
      // idle one is that timeout.
      track("turn_finished", {
        duration_s: Math.max(0, Math.round((Date.now() - turnStartedAtRef.current) / 1000)),
        finished_by: turnEndReasonRef.current ?? (stagePlayingWhileMineRef.current ? "skip" : "timeout"),
      });
      turnEndReasonRef.current = null;
      stagePlayingWhileMineRef.current = false;
      setSongName(null);
      // Switch back to talking mode when done singing
      if (micMode === "raw") setMicMode("voice");
    }
    if (!isMyTurn) wasMyTurnRef.current = false;
  }, [isMyTurn, micMode, setMicMode]);

  // Analytics: landing in the roster is the moment the join is real. A locked room sits
  // on the auth modal until then, and a reconnect keeps the same page session, so this
  // fires once per visit. The room code is hashed locally to answer "been here before".
  const hasJoined = myPeerId !== null && roomState.participants.some((p) => p.id === myPeerId);
  const joinTrackedRef = useRef(false);
  useEffect(() => {
    if (!hasJoined || joinTrackedRef.current) return;
    joinTrackedRef.current = true;
    // The visit marker is local state this event needs, so it is only written when the
    // event can actually be sent: a Do Not Track browser leaves with nothing stored.
    if (!analyticsEnabled()) return;
    track("room_joined", {
      role: wasCreatedHere(roomCode) ? "creator" : "joiner",
      rejoin: markRoomVisited(roomCode),
    });
  }, [hasJoined, roomCode]);

  // Two notices worth knowing the reach of: the Bluetooth route warning, and every
  // surface that tells this device its audio is blocked. Both are latched like the join
  // above, because both booleans flap: a Bluetooth route change flips one, and the 1s
  // play retry briefly reaching PLAYING flips the other, so the device already failing to
  // hold its audio would report the same notice again and again.
  const btNoticeVisible = bluetoothDetected && !btNoticeDismissed;
  const btNoticeTrackedRef = useRef(false);
  useEffect(() => {
    if (!btNoticeVisible || btNoticeTrackedRef.current) return;
    btNoticeTrackedRef.current = true;
    track("bt_notice_shown");
  }, [btNoticeVisible]);

  const playbackBlockedVisible = audioUnlocked && (voicePlaybackBlocked || (playbackBlocked && !isMyTurn));
  const playbackBlockedTrackedRef = useRef(false);
  useEffect(() => {
    if (!playbackBlockedVisible || playbackBlockedTrackedRef.current) return;
    playbackBlockedTrackedRef.current = true;
    track("playback_blocked_shown");
  }, [playbackBlockedVisible]);

  // Send status updates (includes LiveKit identity). isSharingAudio now means
  // "the stage video is playing", which is what suspends the 60s singer timer.
  const isStageVideoPlaying = isMyTurn && (roomState.video?.playing ?? false);
  useEffect(() => {
    if (!isPartyConnected) return;
    sendStatusUpdate({
      isMuted: !isMicEnabled,
      isSharingAudio: isStageVideoPlaying,
      currentSong: songName,
      browser: browser.name + (browser.isMobile ? " (Mobile)" : ""),
      lkIdentity: lkIdentity ?? undefined,
      isDeafened: deafened,
    });
  }, [isMicEnabled, isStageVideoPlaying, songName, isPartyConnected, sendStatusUpdate, browser, lkIdentity, deafened]);

  // Broadcast to room when quota is hit so existing users know
  const quotaBroadcastedRef = useRef(false);
  useEffect(() => {
    if (liveKitError?.includes("session limit") && !quotaBroadcastedRef.current && isPartyConnected) {
      quotaBroadcastedRef.current = true;
      sendChat("[System] This room's session quota has been reached. New people can't join. If you need more people, create a new room.");
    }
  }, [liveKitError, isPartyConnected, sendChat]);

  // Auto-submit password from sessionStorage (room creator flow)
  useEffect(() => {
    if (!authRequired || authAutoSubmittedRef.current) return;
    const stored = readSessionPref(`room-password-${roomCode}`);
    if (stored) {
      authAutoSubmittedRef.current = true;
      sendAuth(stored);
      removeSessionPref(`room-password-${roomCode}`);
    }
  }, [authRequired, roomCode, sendAuth]);

  // Set password after joining as room creator
  useEffect(() => {
    if (!isAdmin || authAutoSubmittedRef.current) return;
    const stored = readSessionPref(`room-password-${roomCode}`);
    if (stored) {
      sendSetPassword(stored);
      removeSessionPref(`room-password-${roomCode}`);
    }
  }, [isAdmin, roomCode, sendSetPassword]);

  // Replay the name and listing choice made on the create card. The server persists both,
  // so this is a no-op for a room that already knows them.
  useEffect(() => {
    if (!isAdmin) return;
    const storedName = readSessionPref(`room-name-${roomCode}`);
    if (storedName) sendSetRoomName(storedName);
    const storedPublic = readSessionPref(`room-public-${roomCode}`);
    if (storedPublic) sendSetPublic(storedPublic === "1");
  }, [isAdmin, roomCode, sendSetRoomName, sendSetPublic]);

  // Settings edits win over the create-card values on the next replay
  const handleSetRoomName = useCallback((name: string | null) => {
    sendSetRoomName(name);
    if (name) writeSessionPref(`room-name-${roomCode}`, name);
    else removeSessionPref(`room-name-${roomCode}`);
  }, [sendSetRoomName, roomCode]);

  const handleSetPublic = useCallback((isPublic: boolean) => {
    sendSetPublic(isPublic);
    writeSessionPref(`room-public-${roomCode}`, isPublic ? "1" : "0");
  }, [sendSetPublic, roomCode]);

  // The join gesture asks for the mic, but LiveKit may still be connecting, so the
  // request waits for the room rather than failing silently
  useEffect(() => {
    if (!micOnJoinPending || !isLiveKitConnected) return;
    setMicOnJoinPending(false);
    if (deafened) return;
    void setMicMuted(false);
  }, [micOnJoinPending, isLiveKitConnected, deafened, setMicMuted]);

  // A room joined mic-on opens its capture before the probe is ever armed, so the probe
  // stands down and the enumeration that ran alongside it read no labels: the permission
  // was still pending. The open mic is the moment permission is real, so re-enumerate.
  useEffect(() => {
    if (!isMicEnabled) return;
    void refreshDevices();
  }, [isMicEnabled, refreshDevices]);

  useEffect(() => {
    document.title = `${roomState.roomName || `Room ${roomCode}`} | Karaoke Now`;
    return () => { document.title = DEFAULT_TITLE; };
  }, [roomState.roomName, roomCode]);

  // Held from the join gesture onward and released when the room view unmounts
  useWakeLock(audioUnlocked);

  // The silent loop is started by the join gesture, not here: only the gesture may
  // play it. This owns the other end, so leaving the room stops holding the session.
  useEffect(() => stopSilentUnlock, []);

  useAtmosphere({
    videoId: roomState.video?.videoId ?? null,
    songName: roomState.currentSingerId
      ? participantStatus[roomState.currentSingerId]?.currentSong ?? null
      : null,
  });

  // The singer is the room's clock, so a hidden page hands it back immediately rather
  // than waiting for the server stall timeout, and takes it back when the page returns.
  const pausedWhileHiddenRef = useRef(false);
  useEffect(() => {
    if (!isMyTurn) {
      pausedWhileHiddenRef.current = false;
      return;
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (!videoRef.current?.playing) return;
        // Handing back the clock cannot wait on a read a freezing page may never
        // answer. The position is read after the pause because a paused player's clock
        // is frozen, so it cannot drift while the read is in flight.
        pausedWhileHiddenRef.current = true;
        playerRef.current?.pause();
        void readPlayerTime().then((at) => broadcastNowRef.current(false, at));
        return;
      }
      if (!pausedWhileHiddenRef.current) return;
      pausedWhileHiddenRef.current = false;
      if (videoRef.current?.playing) return;
      playerRef.current?.play();
      void readPlayerTime().then((at) => broadcastNowRef.current(true, at));
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [isMyTurn, videoRef, readPlayerTime]);

  // These screens unmount the modal that owns the mic check while useLiveKit stays
  // mounted, so the loopback would keep running with no button left to stop it.
  useEffect(() => {
    if (kicked || authRequired) stopMicCheck();
  }, [kicked, authRequired, stopMicCheck]);

  // Kicked state - show banner and stop
  if (kicked) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center px-4">
        <div
          className="w-full max-w-sm rounded-xl p-6 text-center"
          style={{ background: "var(--color-dark-surface)", boxShadow: "var(--shadow-elevation-1)" }}
        >
          <p className="mb-2 text-sm font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--color-danger)" }}>
            You were kicked by {kicked}
          </p>
          <p className="mb-4 text-xs" style={{ color: "var(--color-text-muted)" }}>
            You can no longer participate in this room.
          </p>
          <Button
            onClick={() => router.push("/")}
            className="h-10 px-6 font-bold"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Back to Home
          </Button>
        </div>
      </main>
    );
  }

  // Auth required - show password modal
  if (authRequired) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center px-4">
        <AuthModal onSubmit={sendAuth} authFailed={authFailed} />
      </main>
    );
  }

  const roomPanels: RoomPanel[] = [
    {
      id: "people",
      label: "People",
      region: "left",
      count: roomState.participants.length,
      content: (
        <PeoplePanel
          roomState={roomState}
          myPeerId={myPeerId}
          participantStatus={participantStatus}
          activeSpeakers={activeSpeakers}
          people={people}
          master={master}
          volumeControlLost={volumeControlLost}
          onPersonVolumeChange={setPersonVolume}
          onTogglePersonMute={togglePersonMute}
          onKick={isAdmin ? sendKick : undefined}
          onTransferAdmin={isAdmin ? sendTransferAdmin : undefined}
          onRemoveFromQueue={isAdmin ? sendRemoveFromQueue : undefined}
        />
      ),
    },
    {
      id: "queue",
      label: "Queue",
      region: "left",
      count: roomState.queue.length,
      content: (
        <QueuePanel
          roomState={roomState}
          myPeerId={myPeerId}
          participantStatus={participantStatus}
          onRequestJoinQueue={handleJoinQueue}
          onLeaveQueue={handleLeaveQueue}
        />
      ),
    },
    {
      id: "chat",
      label: "Chat",
      region: "right",
      content: (
        <ChatPanel
          messages={chatMessages}
          onSend={handleSendChat}
          myPeerId={myPeerId}
          adminPeerId={roomState.adminPeerId}
          currentSingerId={roomState.currentSingerId}
          onReact={handleReact}
        />
      ),
    },
  ];

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      {/* Audio unlock prompt - dismisses on first click to satisfy autoplay policy */}
      <AudioUnlockOverlay
        onUnlock={() => {
          createPlayer();
          resumeMixer();
          startSilentUnlock();
          setAudioUnlocked(true);
          setMicOnJoinPending(readPref(MIC_ON_PREF_KEY) !== "off");
        }}
        apiReady={apiReady}
        partyConnected={isPartyConnected}
        livekitConnected={isLiveKitConnected}
        roomName={roomState.roomName}
        roomCode={roomCode}
        participantCount={roomState.participants.length}
      />

      {/* Atmosphere mesh: colors come from the atmosphere contract, intensity from the singer */}
      <div className="atmo-mesh pointer-events-none fixed inset-0" aria-hidden="true" />
      <div className="atmo-halo pointer-events-none fixed inset-0" aria-hidden="true" />

      {/* Header */}
      <header
        className="relative z-10 flex shrink-0 items-center justify-between gap-2 border-b px-3 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)] sm:px-5 lg:px-7"
        style={{ borderColor: DIVIDER, background: "color-mix(in srgb, var(--color-dark-surface) 82%, transparent)" }}
      >
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <h1
            className="text-lg font-extrabold lg:text-xl"
            style={{
              fontFamily: "var(--font-display)",
              background: "linear-gradient(135deg, var(--color-primary), var(--color-accent))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Karaoke Now
          </h1>
          <div className="hidden h-7 w-px sm:block" style={{ background: DIVIDER }} />
          <div className="min-w-0">
            {roomState.roomName ? (
              <div className="flex min-w-0 items-center gap-1">
                <p
                  className="truncate text-sm font-bold sm:text-base"
                  style={{ fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}
                  title={roomState.roomName}
                >
                  {roomState.roomName}
                </p>
                {isAdmin && (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => { setSettingsFocusRoomName(true); setSettingsOpen(true); }}
                          className="shrink-0 cursor-pointer opacity-60 hover:opacity-100"
                          style={{ color: "var(--color-text-muted)" }}
                          aria-label="Rename room"
                        >
                          <Pencil size={12} />
                        </Button>
                      }
                    />
                    <TooltipContent>Rename room</TooltipContent>
                  </Tooltip>
                )}
              </div>
            ) : null}
            <InviteCode code={roomCode} />
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {/* Settings */}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="secondary"
                  size="icon-lg"
                  onClick={() => setSettingsOpen(true)}
                  className="size-9 cursor-pointer rounded-full sm:size-10"
                  aria-label="Settings"
                >
                  <SettingsIcon size={18} />
                </Button>
              }
            />
            <TooltipContent>Settings</TooltipContent>
          </Tooltip>

          {/* Leave */}
          <Button
            onClick={() => router.push("/")}
            className="h-10 cursor-pointer gap-2 bg-[#b40712] px-3 text-xs font-semibold text-white hover:bg-[#cf1220] sm:px-4 sm:text-sm"
            style={{ fontFamily: "var(--font-display)" }}
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">Exit Room</span>
          </Button>
        </div>
      </header>

      {/* Error banner */}
      {liveKitError && liveKitError !== "Reconnecting..." && (
        <div
          className="relative z-10 mx-4 mt-2 rounded-lg px-4 py-3 text-xs lg:mx-6"
          style={{ background: "var(--color-danger-dim)", color: "var(--color-danger)" }}
        >
          <p>{liveKitError}</p>
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              onClick={() => router.push("/")}
              className="cursor-pointer bg-[var(--color-danger)] text-[11px] text-[var(--color-text-primary)] hover:bg-[color-mix(in_srgb,var(--color-danger)_82%,white)]"
            >
              Create New Room
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.location.reload()}
              className="cursor-pointer border-[var(--color-danger)] bg-transparent text-[11px] text-[var(--color-danger)] hover:bg-[var(--color-danger-dim)] hover:text-[var(--color-danger)]"
            >
              Try Again
            </Button>
          </div>
        </div>
      )}

      {/* Reconnect banner - the join overlay covers the first connect, so this only
          ever means a socket that dropped after the user was in the room */}
      {!isPartyConnected && (
        <div
          className="relative z-10 mx-4 mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs lg:mx-6"
          style={{ background: "var(--color-danger-dim)", color: "var(--color-danger)" }}
          role="status"
        >
          <WifiOff size={14} />
          <span>Reconnecting to the room. Chat, the queue and playback sync are paused.</span>
        </div>
      )}

      {/* The loud half of the audio recovery: LiveKit told us this browser refused to
          play remote voices, which is the one case with a real signal. The quiet half
          lives in the toolbar and is always there, because the Android force-fade that
          silences a singer mid-song raises no signal at all.
          The CTA treatment separates it from the notices above and below: those report,
          this one acts. Never auto-retried, the tap is the gesture the browser wants. */}
      {audioUnlocked && voicePlaybackBlocked && (
        <button
          type="button"
          onClick={handleTapToHear}
          className="relative z-10 mx-4 mt-2 flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold shadow-[var(--shadow-control)] transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.99] lg:mx-6"
          style={{
            background: "linear-gradient(135deg, var(--color-primary), color-mix(in oklab, var(--color-primary) 78%, black))",
            color: "#fff",
          }}
          data-testid="tap-to-hear"
        >
          <Volume2 size={14} style={{ flexShrink: 0 }} />
          <span className="min-w-0 flex-1">
            Tap to bring the sound back. This device paused the music and everyone&apos;s voices.
          </span>
        </button>
      )}

      {/* The mic the OS took away. Same CTA idiom as the tap-to-hear banner because it
          is the same kind of surface: a state only a gesture can leave. The singer also
          sees it on the stage banner through singingError, which reports rather than
          acts, so the one tap target stays here. */}
      {audioUnlocked && micStopped && (
        <button
          type="button"
          onClick={() => { void restartMic(); track("mic_restart_tapped"); }}
          className="relative z-10 mx-4 mt-2 flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold shadow-[var(--shadow-control)] transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.99] lg:mx-6"
          style={{
            background: "linear-gradient(135deg, var(--color-primary), color-mix(in oklab, var(--color-primary) 78%, black))",
            color: "#fff",
          }}
          data-testid="restart-mic"
        >
          <MicOff size={14} style={{ flexShrink: 0 }} />
          <span className="min-w-0 flex-1">
            Mic stopped, tap to restart. Your device took the microphone back, so the room cannot hear you.
          </span>
        </button>
      )}

      {/* Bluetooth route notice - informational, not an error: the page cannot keep
          A2DP alive while a mic is open, so the only fix is a different route */}
      {btNoticeVisible && (
        <div
          className="relative z-10 mx-4 mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs lg:mx-6"
          style={{ background: "var(--color-dark-raised)", color: "var(--color-text-secondary)" }}
          role="status"
        >
          <Bluetooth size={14} style={{ color: "var(--color-primary-bright)", flexShrink: 0 }} />
          <span className="min-w-0 flex-1">
            Bluetooth headsets drop to phone-call quality while a mic is on, wired or speaker sounds best.
          </span>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Dismiss Bluetooth notice"
            onClick={dismissBtNotice}
            className="size-7 shrink-0 cursor-pointer"
            style={{ color: "var(--color-text-muted)" }}
          >
            <X size={14} />
          </Button>
        </div>
      )}

      <RoomShell
        panels={roomPanels}
        stage={
          <>
            <VideoStage
              mountRef={mountRef}
              hasVideo={roomState.video !== null}
              ready={playerReady}
              embedBlocked={embedBlocked}
              errorCode={playerErrorCode}
              isSinger={isMyTurn}
              showTapToPlay={playbackBlocked && !isMyTurn && !voicePlaybackBlocked}
              onTapToPlay={() => { resumeMixer(); player.play(); track("audio_recover_tapped"); }}
            />
            <VideoProgress player={player} active={roomState.video !== null && playerReady} />
            <div
              className={`relative flex min-h-0 flex-1 flex-col rounded-2xl ${roomState.currentSingerId ? "p-2 sm:p-3" : "overflow-y-auto p-3 sm:p-5"}`}
              style={{
                background: roomState.currentSingerId
                  ? "transparent"
                  : "radial-gradient(circle at 50% 10%, var(--color-primary-dim), transparent 55%), var(--color-dark-surface)",
                boxShadow: roomState.currentSingerId ? undefined : "var(--shadow-elevation-1)",
              }}
            >
              {/* While singing the banner scrolls inside its own rounded card, so this
                  container must not clip: overflow here would shear the atmo glow square.
                  Auto margins center only when content fits. */}
              <div className={roomState.currentSingerId ? "my-auto flex max-h-full min-h-0 w-full flex-col" : "my-auto w-full"}>
              <StageBanner
                getSingerLevel={room ? getStageLevel : null}
                getSingerTrack={getSingerTrack}
                roomState={roomState}
                isMyTurn={isMyTurn}
                onFinishSinging={handleFinishSinging}
                audioError={singingError}
                onSkipSinger={
                  isAdmin && !isMyTurn && roomState.currentSingerId !== null
                    ? () => setSkipTargetId(roomState.currentSingerId)
                    : undefined
                }
                singerSongName={
                  roomState.currentSingerId
                    ? participantStatus[roomState.currentSingerId]?.currentSong ?? null
                    : null
                }
                onAddToQueue={
                  roomState.queue.length === 0 && !isMyTurn
                    ? handleJoinQueue
                    : undefined
                }
                onSetSongName={isMyTurn ? setSongName : undefined}
                onLoadVideo={isMyTurn ? handleLoadVideo : undefined}
                onPlay={isMyTurn ? handleTransportPlay : undefined}
                onPause={isMyTurn ? handleTransportPause : undefined}
                onRestart={isMyTurn ? () => { player.seek(0); player.play(); broadcastNow(true, 0); } : undefined}
                playbackReady={playerReady}
                onMixMusicGain={setMusic}
                mixMusicValue={Math.round(music * 100)}
                listenerVoiceValue={Math.round(singerMix.volume * 100)}
                listenerVoiceMuted={singerMix.muted}
                onListenerVoiceChange={!isMyTurn && singerMixKey
                  ? (v) => setPersonVolume(singerMixKey, v / 100)
                  : undefined}
                onToggleListenerVoiceMute={!isMyTurn && singerMixKey
                  ? () => togglePersonMute(singerMixKey)
                  : undefined}
                volumeControlLost={volumeControlLost}
                syncAuto={syncOffsetAuto}
                onSyncAutoChange={!isMyTurn ? handleSyncAutoChange : undefined}
                autoOffsetMs={autoOffsetMs}
                syncOffsetMs={syncOffsetMs}
                onSyncOffsetChange={!isMyTurn ? handleSyncOffsetChange : undefined}
                syncSingerName={singerName}
              />
              </div>
            <StageAnnouncement
              singerId={roomState.currentSingerId}
              singerName={singerName}
              isMyTurn={isMyTurn}
              armed={audioUnlocked}
              deafened={deafened}
              getSfxTarget={mixer.sfxTarget}
            />

            {/* Reactions and chat surface within the stage, just above the sound toolbar. */}
            {(reactions.length > 0 || floatingChatMessages.length > 0) && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 h-48" aria-live="polite" aria-label="Room activity">
                <div className="absolute inset-0 overflow-hidden">
                  {reactions.map((reaction) => (
                    <div
                      key={reaction.id}
                      className="absolute bottom-2"
                      style={{
                        left: `clamp(4.5rem, ${reaction.left}%, calc(100% - 4.5rem))`,
                        transform: "translateX(-50%)",
                      }}
                    >
                      <div
                        className="flex max-w-[min(14rem,calc(100vw-2rem))] items-center gap-2 rounded-full px-3.5 py-2 backdrop-blur-md will-change-transform"
                        style={{
                          animation: "reaction-bubble-float 3s cubic-bezier(0.22, 1, 0.36, 1) forwards",
                          background: "color-mix(in srgb, var(--color-dark-card) 88%, transparent)",
                          boxShadow: "var(--shadow-elevation-2)",
                        }}
                      >
                        <span
                          className="max-w-28 truncate text-xs font-semibold"
                          style={{ color: reaction.from === myPeerId ? "var(--color-primary)" : chatNameColor(reaction.from) }}
                        >
                          {reaction.fromName}
                        </span>
                        <span className="text-2xl leading-none" aria-hidden="true">{reaction.emoji}</span>
                        <span className="sr-only">{reaction.fromName} reacted with {reaction.emoji}</span>
                      </div>
                    </div>
                  ))}

                  <div className="absolute bottom-2 left-1/2 flex w-[min(22rem,calc(100%_-_1.5rem))] -translate-x-1/2 flex-col-reverse items-center gap-2">
                    {floatingChatMessages.map((message) => (
                      <div
                        key={message.id}
                        className="flex w-fit max-w-full items-baseline gap-2 rounded-2xl px-4 py-2.5 backdrop-blur-md will-change-transform"
                        style={{
                          animation: "chat-bubble-float 4s cubic-bezier(0.22, 1, 0.36, 1) forwards",
                          background: "color-mix(in srgb, var(--color-dark-card) 92%, transparent)",
                          boxShadow: "var(--shadow-elevation-2)",
                        }}
                      >
                        <span
                          className="max-w-28 shrink-0 truncate text-xs font-semibold"
                          style={{ color: message.from === myPeerId ? "var(--color-primary)" : chatNameColor(message.from) }}
                        >
                          {message.fromName}
                        </span>
                        <p className="min-w-0 break-words text-sm leading-5" style={{ color: "var(--color-text-primary)" }}>{message.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            </div>

            <Toolbar
              getMicLevel={room ? getMicLevel : null}
              isMicEnabled={isMicEnabled}
              toggleMic={() => toggleMic(!isMicEnabled)}
              voiceEffect={voiceEffect}
              onVoiceEffectChange={setVoiceEffect}
              effectWetDry={effectWetDry}
              onEffectWetDry={setEffectWetDry}
              noiseCancellationMode={noiseCancellationMode}
              ncActive={managedCaptureProfile.nc}
              onNoiseCancellationModeChange={setNoiseCancellationMode}
              onSoundProfileOpen={() => setSoundProfileOpen(true)}
              onRecoverAudio={handleTapToHear}
              deafened={deafened}
              onToggleDeafen={handleToggleDeafen}
            />
          </>
        }
      />

      {/* Settings drawer */}
      <SettingsDrawer
        open={settingsOpen}
        onClose={() => { setSettingsOpen(false); setSettingsFocusRoomName(false); }}
        master={master}
        onMasterChange={setMaster}
        volumeControlLost={volumeControlLost}
        onResetPeopleVolumes={resetPeople}
        displayName={playerName}
        onRename={onRename}
        isAdmin={isAdmin}
        isLocked={roomState.isLocked}
        onSetPassword={isAdmin ? sendSetPassword : undefined}
        roomName={roomState.roomName}
        onSetRoomName={isAdmin ? handleSetRoomName : undefined}
        isPublic={roomState.isPublic}
        onSetPublic={isAdmin ? handleSetPublic : undefined}
        focusRoomName={settingsFocusRoomName}
      />

      {/* Skip singer confirm */}
      {isAdmin && skipTargetId !== null && skipTargetId === roomState.currentSingerId && (
        <SkipSingerConfirm
          singerName={singerName}
          onCancel={() => setSkipTargetId(null)}
          onConfirm={() => { sendSkipSinger(); setSkipTargetId(null); }}
        />
      )}

      {/* Sound Profile Modal */}
      <SoundProfileModal
        open={soundProfileOpen}
        onClose={() => setSoundProfileOpen(false)}
        micMode={micMode}
        voiceEffect={voiceEffect}
        onVoiceEffectChange={setVoiceEffect}
        effectWetDry={effectWetDry}
        onEffectWetDry={setEffectWetDry}
        noiseCancellationMode={noiseCancellationMode}
        onNoiseCancellationModeChange={setNoiseCancellationMode}

        inputDevices={inputDevices}
        outputDevices={outputDevices}
        selectedInputId={selectedInputId}
        activeInputId={builtInInputDeviceId ?? selectedInputId}
        selectedOutputId={selectedOutputId}
        onInputChange={setSelectedInputId}
        onOutputChange={setSelectedOutputId}
        onTalkingMicCheck={() => startTalkingMicCheck(talkingNC)}
        onSingingMicCheck={() => startSingingMicCheck(singingNC)}
        onStopMicCheck={stopMicCheck}
        micCheckState={micCheckState}
      />

    </main>
  );
}

function SkipSingerConfirm({
  singerName,
  onCancel,
  onConfirm,
}: {
  singerName: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open onOpenChange={(next) => { if (!next) onCancel(); }}>
      <DialogContent className="sm:max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "var(--font-display)" }}>
            Skip {singerName ?? "the current singer"}?
          </DialogTitle>
          <DialogDescription>
            Their turn ends right away, the video stops for everyone, and the next person in the queue goes on stage. The room is told in chat.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" className="h-10" />}>Cancel</DialogClose>
          <Button variant="destructive" className="h-10 bg-[var(--color-danger)] text-white hover:brightness-110" onClick={onConfirm}>
            Skip singer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface EntryStep {
  label: string;
  done: boolean;
}

function AudioUnlockOverlay({
  onUnlock,
  apiReady,
  partyConnected,
  livekitConnected,
  roomName,
  roomCode,
  participantCount,
}: {
  onUnlock: () => void;
  apiReady: boolean;
  partyConnected: boolean;
  livekitConnected: boolean;
  roomName: string | null;
  roomCode: string;
  participantCount: number;
}) {
  const [visible, setVisible] = useState(true);
  const [waited, setWaited] = useState(false);

  // The player must be built inside the join click for autoplay to work, which needs
  // the IFrame API in hand. The timer is the escape hatch if anything never arrives.
  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), API_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;
  const steps: EntryStep[] = [
    { label: "Connecting to the room", done: partyConnected },
    { label: "Setting up audio", done: livekitConnected },
    { label: "Preparing the stage", done: apiReady },
  ];
  const ready = waited || steps.every((s) => s.done);
  const title = roomName ?? `Room ${roomCode}`;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center px-6 ${ready ? "cursor-pointer" : "cursor-progress"}`}
      style={{ background: "rgba(9, 9, 11, 0.92)" }}
      onClick={ready ? () => { onUnlock(); setVisible(false); } : undefined}
      data-testid="room-entry"
      data-party-connected={partyConnected}
      data-livekit-connected={livekitConnected}
      data-player-api-ready={apiReady}
    >
      <div className="w-full max-w-xs text-center" style={{ animation: "fade-in 0.3s ease-out" }}>
        <img src="/icon-192.png" alt="" className="mx-auto mb-4 size-16 rounded-2xl" style={{ animation: ready ? undefined : "pulse-ring 1.6s ease-in-out infinite" }} />
        <p className="text-xl font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}>
          {title}
        </p>
        <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
          {participantCount > 1 ? `${participantCount} in the room` : "Be the first one in"}
        </p>

        {ready ? (
          <button
            className="mt-6 w-full cursor-pointer rounded-xl px-6 py-3 text-sm font-bold transition-all hover:brightness-110 active:scale-[0.98]"
            style={{
              fontFamily: "var(--font-display)",
              background: "linear-gradient(135deg, var(--color-primary), color-mix(in oklab, var(--color-primary) 78%, black))",
              color: "#fff",
              boxShadow: "0 0 24px color-mix(in srgb, var(--color-primary) 35%, transparent)",
              animation: "fade-in 0.25s ease-out",
            }}
          >
            Join the party
          </button>
        ) : (
          <div className="mt-6 space-y-2 text-left">
            {steps.map((step) => (
              <div key={step.label} className="flex items-center gap-2.5 text-xs" style={{ color: step.done ? "var(--color-text-secondary)" : "var(--color-text-muted)" }}>
                {step.done
                  ? <Check size={13} style={{ color: "var(--color-success)" }} />
                  : <LoaderCircle size={13} className="animate-spin" style={{ color: "var(--color-primary)" }} />}
                {step.label}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
