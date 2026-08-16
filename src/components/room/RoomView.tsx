"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useRoomState } from "~/hooks/useRoomState";
import { useLiveKit, MIC_ON_PREF_KEY } from "~/hooks/useLiveKit";
import { useAudioDevices } from "~/hooks/useAudioDevices";
import { useYouTubePlayer } from "~/hooks/useYouTubePlayer";
import { useVideoSync } from "~/hooks/useVideoSync";
import { useWakeLock } from "~/hooks/useWakeLock";
import { Check, LoaderCircle, LogOut, Pencil, Settings as SettingsIcon, SkipForward, WifiOff } from "lucide-react";
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
import { chatNameColor } from "~/lib/chatColors";
import { readPref, writePref } from "~/lib/prefs";
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
const DEFAULT_TITLE = "Karaoke Now - Sing Together Online";

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
  const [singerMutedAll, setSingerMutedAll] = useState(false);
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
    sendMuteAll,
    sendUnmuteAll,
    sendVideoLoad,
    sendVideoSync,
    videoRef,
    serverOffsetRef,
    clockSyncedRef,
    mutedBySinger,
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
  } = useAudioDevices();

  const {
    room,
    isConnected: isLiveKitConnected,
    error: liveKitError,
    isMicEnabled,
    toggleMic,
    setMicMuted,
    micCheckState,
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
    selectedOutputDeviceId: selectedOutputId,
    micMode,
    talkingNC,
    singingNC,
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
  const songNameRef = useRef(songName);
  songNameRef.current = songName;

  const handlePlayerStateChange = useCallback((state: number) => {
    if (!isMyTurnForPlayerRef.current) return;
    // 1 = playing, 5 = cued: the video metadata is available in both
    if ((state === 1 || state === 5) && !songNameRef.current) {
      const title = playerRef.current?.getTitle();
      if (title) setSongName(title);
    }
    // The singer is the clock, so a pause the app did not initiate still has to ship.
    // Only while the room believes playback is live: swapping videos also lands in
    // PAUSED, and that position belongs to the video that just left the stage.
    if (state === 1) broadcastNowRef.current?.(true, playerRef.current?.getTime() ?? 0);
    if (state === 2 && videoRef.current?.playing) broadcastNowRef.current?.(false, playerRef.current?.getTime() ?? 0);
    if (state === 0) broadcastNowRef.current?.(false, 0);
  }, [videoRef]);

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

  const micChecking = micCheckState !== "idle" && micCheckState !== "error";

  const {
    master,
    music,
    people,
    deafened,
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
    currentSingerId: roomState.currentSingerId,
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
      playReactionSound(latest.emoji);
    }
    prevReactionCountRef.current = reactions.length;
  }, [reactions, deafened]);

  // Mute/unmute mic when singer sends mute-all
  // Snapshot pre-mute state so unmute only restores those who were unmuted before
  const wasMutedBySingerRef = useRef(false);
  const micWasOnBeforeMuteRef = useRef(false);
  useEffect(() => {
    if (mutedBySinger && !wasMutedBySingerRef.current) {
      wasMutedBySingerRef.current = true;
      micWasOnBeforeMuteRef.current = isMicEnabled;
      if (isMicEnabled) {
        // setMicMuted handles both the singing mix and the idle managed-mic path
        void setMicMuted(true);
      }
    }
    if (!mutedBySinger && wasMutedBySingerRef.current) {
      wasMutedBySingerRef.current = false;
      // Deafen outranks the restore: a deafened mic stays off until they undeafen
      if (micWasOnBeforeMuteRef.current && !deafened) {
        void setMicMuted(false);
      }
      micWasOnBeforeMuteRef.current = false;
    }
  }, [mutedBySinger, isMicEnabled, setMicMuted, deafened]);

  // Deafen force-mutes the mic; the snapshot means undeafening only unmutes
  // people who were unmuted before and are not still under the singer's mute-all
  const micWasOnBeforeDeafenRef = useRef(false);
  const handleToggleDeafen = useCallback(() => {
    if (!deafened) {
      micWasOnBeforeDeafenRef.current = isMicEnabled;
      if (isMicEnabled) void setMicMuted(true);
      setDeafened(true);
      return;
    }
    if (micWasOnBeforeDeafenRef.current && !mutedBySinger) void setMicMuted(false);
    micWasOnBeforeDeafenRef.current = false;
    setDeafened(false);
  }, [deafened, isMicEnabled, setMicMuted, setDeafened, mutedBySinger]);

  // Auto-switch to singing mode ONCE when becoming the singer
  const wasMyTurnRef = useRef(false);
  useEffect(() => {
    if (isMyTurn && !wasMyTurnRef.current) {
      wasMyTurnRef.current = true;
      if (micMode === "voice") setMicMode("raw");
    }
    if (!isMyTurn && wasMyTurnRef.current) {
      wasMyTurnRef.current = false;
      if (singerMutedAll) setSingerMutedAll(false);
      setSongName(null);
      // Switch back to talking mode when done singing
      if (micMode === "raw") setMicMode("voice");
    }
    if (!isMyTurn) wasMyTurnRef.current = false;
  }, [isMyTurn, micMode, setMicMode, singerMutedAll]);

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
    const stored = sessionStorage.getItem(`room-password-${roomCode}`);
    if (stored) {
      authAutoSubmittedRef.current = true;
      sendAuth(stored);
      sessionStorage.removeItem(`room-password-${roomCode}`);
    }
  }, [authRequired, roomCode, sendAuth]);

  // Set password after joining as room creator
  useEffect(() => {
    if (!isAdmin || authAutoSubmittedRef.current) return;
    const stored = sessionStorage.getItem(`room-password-${roomCode}`);
    if (stored) {
      sendSetPassword(stored);
      sessionStorage.removeItem(`room-password-${roomCode}`);
    }
  }, [isAdmin, roomCode, sendSetPassword]);

  // Replay the name and listing choice made on the create card. The server persists both,
  // so this is a no-op for a room that already knows them.
  useEffect(() => {
    if (!isAdmin) return;
    const storedName = sessionStorage.getItem(`room-name-${roomCode}`);
    if (storedName) sendSetRoomName(storedName);
    const storedPublic = sessionStorage.getItem(`room-public-${roomCode}`);
    if (storedPublic) sendSetPublic(storedPublic === "1");
  }, [isAdmin, roomCode, sendSetRoomName, sendSetPublic]);

  // Settings edits win over the create-card values on the next replay
  const handleSetRoomName = useCallback((name: string | null) => {
    sendSetRoomName(name);
    try {
      if (name) sessionStorage.setItem(`room-name-${roomCode}`, name);
      else sessionStorage.removeItem(`room-name-${roomCode}`);
    } catch {
      // storage unavailable, the server still has the change
    }
  }, [sendSetRoomName, roomCode]);

  const handleSetPublic = useCallback((isPublic: boolean) => {
    sendSetPublic(isPublic);
    try {
      sessionStorage.setItem(`room-public-${roomCode}`, isPublic ? "1" : "0");
    } catch {
      // storage unavailable, the server still has the change
    }
  }, [sendSetPublic, roomCode]);

  // The join gesture asks for the mic, but LiveKit may still be connecting, so the
  // request waits for the room rather than failing silently
  useEffect(() => {
    if (!micOnJoinPending || !isLiveKitConnected) return;
    setMicOnJoinPending(false);
    if (deafened || mutedBySinger) return;
    void setMicMuted(false);
  }, [micOnJoinPending, isLiveKitConnected, deafened, mutedBySinger, setMicMuted]);

  useEffect(() => {
    document.title = `${roomState.roomName || `Room ${roomCode}`} · Karaoke Now`;
    return () => { document.title = DEFAULT_TITLE; };
  }, [roomState.roomName, roomCode]);

  // Held from the join gesture onward and released when the room view unmounts
  useWakeLock(audioUnlocked);

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
        const at = playerRef.current?.getTime() ?? 0;
        pausedWhileHiddenRef.current = true;
        playerRef.current?.pause();
        broadcastNowRef.current(false, at);
        return;
      }
      if (!pausedWhileHiddenRef.current) return;
      pausedWhileHiddenRef.current = false;
      if (videoRef.current?.playing) return;
      playerRef.current?.play();
      broadcastNowRef.current(true, playerRef.current?.getTime() ?? 0);
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [isMyTurn, videoRef]);

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
          onRequestJoinQueue={joinQueue}
          onLeaveQueue={leaveQueue}
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
          onSend={sendChat}
          myPeerId={myPeerId}
          adminPeerId={roomState.adminPeerId}
          currentSingerId={roomState.currentSingerId}
          onReact={sendReaction}
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

      {/* Muted by singer banner */}
      {mutedBySinger && (
        <div
          className="relative z-10 mx-4 mt-2 rounded-lg px-3 py-2 text-xs lg:mx-6"
          style={{ background: "var(--color-accent-dim)", color: "var(--color-accent)" }}
        >
          {mutedBySinger} muted everyone&apos;s mic
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
              videoId={roomState.video?.videoId ?? null}
              playing={roomState.video?.playing ?? false}
              songName={
                roomState.currentSingerId
                  ? participantStatus[roomState.currentSingerId]?.currentSong ?? null
                  : null
              }
              showTapToPlay={playbackBlocked && !isMyTurn}
              onTapToPlay={() => { resumeMixer(); player.play(); }}
            />
            <VideoProgress player={player} active={roomState.video !== null && playerReady} />
            {isAdmin && roomState.currentSingerId !== null && !isMyTurn && (
              <div className="flex shrink-0 justify-end">
                <button
                  onClick={() => setSkipTargetId(roomState.currentSingerId)}
                  className="flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold shadow-[var(--shadow-elevation-0)] transition-[filter,transform] duration-150 hover:brightness-125 active:scale-[0.98]"
                  style={{
                    fontFamily: "var(--font-display)",
                    background: "var(--color-dark-card)",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  <SkipForward size={13} />
                  Skip singer
                </button>
              </div>
            )}
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
                onFinishSinging={finishSinging}
                audioError={singingError}
                singerSongName={
                  roomState.currentSingerId
                    ? participantStatus[roomState.currentSingerId]?.currentSong ?? null
                    : null
                }
                onAddToQueue={
                  roomState.queue.length === 0 && !isMyTurn
                    ? joinQueue
                    : undefined
                }
                onSetSongName={isMyTurn ? setSongName : undefined}
                onLoadVideo={isMyTurn ? handleLoadVideo : undefined}
                onPlay={isMyTurn ? () => {
                  // Play after the video ended restarts it, so broadcast 0 rather than the
                  // duration the player still reports
                  const ended = player.getState() === 0;
                  if (ended) player.seek(0);
                  player.play();
                  broadcastNow(true, ended ? 0 : player.getTime());
                } : undefined}
                onPause={isMyTurn ? () => { player.pause(); broadcastNow(false, player.getTime()); } : undefined}
                onRestart={isMyTurn ? () => { player.seek(0); player.play(); broadcastNow(true, 0); } : undefined}
                playbackReady={playerReady}
                onMixMusicGain={setMusic}
                mixMusicValue={Math.round(music * 100)}
                listenerVoiceValue={Math.round(singerMix.stage * 100)}
                listenerVoiceMuted={singerMix.muted}
                onListenerVoiceChange={!isMyTurn && singerMixKey
                  ? (v) => setPersonVolume(singerMixKey, "stage", v / 100)
                  : undefined}
                onToggleListenerVoiceMute={!isMyTurn && singerMixKey
                  ? () => togglePersonMute(singerMixKey)
                  : undefined}
                syncAuto={syncOffsetAuto}
                onSyncAutoChange={!isMyTurn ? handleSyncAutoChange : undefined}
                autoOffsetMs={autoOffsetMs}
                syncOffsetMs={syncOffsetMs}
                onSyncOffsetChange={!isMyTurn ? handleSyncOffsetChange : undefined}
                syncSingerName={singerName}
                onMuteAll={() => { sendMuteAll(); setSingerMutedAll(true); }}
                onUnmuteAll={() => { sendUnmuteAll(); setSingerMutedAll(false); }}
                isMutedAll={singerMutedAll}
              />
              </div>
            <StageAnnouncement
              singerId={roomState.currentSingerId}
              singerName={singerName}
              isMyTurn={isMyTurn}
              armed={audioUnlocked}
              deafened={deafened}
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
              toggleMic={toggleMic}
              voiceEffect={voiceEffect}
              onVoiceEffectChange={setVoiceEffect}
              effectWetDry={effectWetDry}
              onEffectWetDry={setEffectWetDry}
              noiseCancellationMode={noiseCancellationMode}
              ncActive={micMode === "raw" ? singingNC : talkingNC}
              onNoiseCancellationModeChange={setNoiseCancellationMode}
              onSoundProfileOpen={() => setSoundProfileOpen(true)}
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
              background: "linear-gradient(135deg, #9d5cff 0%, #7c3aed 100%)",
              color: "#fff",
              boxShadow: "0 0 24px rgba(157, 92, 255, 0.35)",
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
