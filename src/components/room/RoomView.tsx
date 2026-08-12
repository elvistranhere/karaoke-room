"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useRoomState } from "~/hooks/useRoomState";
import { useLiveKit } from "~/hooks/useLiveKit";
import { useAudioDevices } from "~/hooks/useAudioDevices";
import { LogOut, Settings as SettingsIcon } from "lucide-react";
import { detectBrowser, type BrowserInfo } from "~/lib/browser";
import { StageBanner } from "./StageBanner";
import { Toolbar, type NoiseCancellationMode } from "./Toolbar";
import { PeoplePanel } from "./PeoplePanel";
import { ChatPanel } from "./ChatPanel";
import { InviteCode } from "./InviteCode";
import { SettingsDrawer } from "./SettingsDrawer";
import { SoundProfileModal } from "./SoundProfileModal";
import { RecordingModal } from "./RecordingModal";
import { playReactionSound } from "./ReactionBar";
import { chatNameColor } from "~/lib/chatColors";
import { AuthModal } from "./AuthModal";
import { JoinQueueModal } from "./JoinQueueModal";

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
      : { name: "Unknown", isChromium: true, canSing: true, isMobile: false }
  );

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [soundProfileOpen, setSoundProfileOpen] = useState(false);
  const [joinQueueModalOpen, setJoinQueueModalOpen] = useState(false);
  const [noiseCancellationMode, setNoiseCancellationMode] = useState<NoiseCancellationMode>("auto");
  const talkingNC = noiseCancellationMode !== "off";
  const singingNC = noiseCancellationMode === "on";
  const [singerMutedAll, setSingerMutedAll] = useState(false);
  const authAutoSubmittedRef = useRef(false);

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
    sendMixAdjust,
    clearPendingMixAdjust,
    mutedBySinger,
    pendingMixAdjust,
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

  const [mobileSection, setMobileSection] = useState<"stage" | "chat" | "people">("stage");

  const {
    room,
    error: liveKitError,
    isMicEnabled,
    toggleMic,
    setMicMuted,
    micCheckState,
    startTalkingMicCheck,
    startSingingMicCheck,
    stopMicCheck,
    isSharing,
    startSharing,
    stopSharing,
    sharingError,
    currentSong,
    activeSpeakers,
    setMixMicGain,
    setMixMusicGain,
    voiceEffect,
    setVoiceEffect,
    effectWetDry,
    setEffectWetDry,
    autoMix,
    autoMixDuckedValue,
    autoMixBoostedVoice,
    setAutoMix,
    recordingState,
    recordingDuration,
    recordingBlob,
    startRecording,
    stopRecording,
    clearRecording,
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

  // Volume controls
  const [musicVolume, setMusicVolume] = useState(1);
  const [voiceVolume, setVoiceVolume] = useState(1);
  const [personVolumes, setPersonVolumes] = useState<Record<string, number>>({});

  // Collaborative mix values (synced via PartyKit: singer broadcasts to listeners, listeners send to singer)
  const [mixVoiceValue, setMixVoiceValue] = useState(100);
  const [mixMusicValue, setMixMusicValue] = useState(70);

  const applyAllVolumes = useCallback(() => {
    document.querySelectorAll<HTMLAudioElement>('audio[id^="lk-audio-"]').forEach((el) => {
      if (el.dataset.lkType === "music") {
        el.volume = musicVolume;
      } else {
        const identity = el.dataset.lkIdentity ?? "";
        const personVol = personVolumes[identity] ?? 1;
        el.volume = voiceVolume * personVol;
      }
    });
  }, [musicVolume, voiceVolume, personVolumes]);

  useEffect(() => { applyAllVolumes(); }, [applyAllVolumes]);

  // Ref-stable callback for MutationObserver — avoids re-registering on volume changes
  const applyVolumesRef = useRef(applyAllVolumes);
  applyVolumesRef.current = applyAllVolumes;

  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node instanceof HTMLAudioElement && node.id?.startsWith("lk-audio-")) {
            applyVolumesRef.current();
          }
        }
      }
    });
    observer.observe(document.body, { childList: true });
    return () => observer.disconnect();
  }, []);

  const handlePersonVolumeChange = useCallback((identity: string, vol: number) => {
    setPersonVolumes((prev) => ({ ...prev, [identity]: vol }));
    // If this person is the current singer, also sync the music volume
    if (roomState.currentSingerId) {
      const singerStatus = participantStatus[roomState.currentSingerId];
      const singerIdentity = singerStatus?.lkIdentity ?? roomState.participants.find((p) => p.id === roomState.currentSingerId)?.name;
      if (singerIdentity && identity === singerIdentity) {
        setMusicVolume(vol);
      }
    }
  }, [roomState.currentSingerId, roomState.participants, participantStatus]);

  // Debounced broadcast of singer's local mix changes to listeners
  const mixBroadcastRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMyTurnRef = useRef(isMyTurn);
  useEffect(() => {
    isMyTurnRef.current = isMyTurn;
    // Cancel pending broadcast if no longer singer
    if (!isMyTurn && mixBroadcastRef.current) {
      clearTimeout(mixBroadcastRef.current);
      mixBroadcastRef.current = null;
    }
  }, [isMyTurn]);

  const broadcastMix = useCallback((voice: number, music: number) => {
    if (mixBroadcastRef.current) clearTimeout(mixBroadcastRef.current);
    mixBroadcastRef.current = setTimeout(() => {
      if (isMyTurnRef.current) sendMixAdjust(voice, music);
      mixBroadcastRef.current = null;
    }, 150);
  }, [sendMixAdjust]);

  // Handle incoming collaborative mix adjustments
  useEffect(() => {
    if (!pendingMixAdjust) return;
    const { voice, music } = pendingMixAdjust;
    const voicePercent = Math.round(voice * 100);
    const musicPercent = Math.round(music * 100);

    if (isMyTurn) {
      // Singer receives listener's adjustment → apply to gain nodes
      setMixMicGain(voice);
      setMixMusicGain(music);
      setMixVoiceValue(voicePercent);
      setMixMusicValue(musicPercent);
      // Rebroadcast so all other listeners stay in sync
      broadcastMix(voice, music);
    } else {
      // Listener receives singer's broadcast → sync sliders only (no gain, no chat)
      setMixVoiceValue(voicePercent);
      setMixMusicValue(musicPercent);
    }
    clearPendingMixAdjust();
  }, [pendingMixAdjust, isMyTurn, setMixMicGain, setMixMusicGain, clearPendingMixAdjust, broadcastMix]);

  // Forward name-taken rejection to parent so it can show the name modal
  useEffect(() => {
    if (!nameTaken) return;
    onNameRejected?.(nameTaken);
    clearNameTaken(); // always clear to prevent re-firing
  }, [nameTaken, onNameRejected, clearNameTaken]);

  // LiveKit identity for status updates - must be before statusCtxRef
  const lkIdentity = room?.localParticipant?.identity ?? null;

  // Listen for manual song name from singer — ref-stable to avoid re-registration
  const statusCtxRef = useRef({ isMicEnabled, isSharing, browser, sendStatusUpdate, lkIdentity, autoMix });
  statusCtxRef.current = { isMicEnabled, isSharing, browser, sendStatusUpdate, lkIdentity, autoMix };

  useEffect(() => {
    const handler = (e: Event) => {
      const name = (e as CustomEvent<string>).detail;
      if (!name) return;
      const { isMicEnabled: mic, isSharing: share, browser: b, sendStatusUpdate: send, lkIdentity: lkId, autoMix: am } = statusCtxRef.current;
      send({ isMuted: !mic, isSharingAudio: share, currentSong: name, browser: b.name + (b.isMobile ? " (Mobile)" : ""), lkIdentity: lkId ?? undefined, autoMix: am });
    };
    window.addEventListener("karaoke-set-song", handler);
    return () => window.removeEventListener("karaoke-set-song", handler);
  }, []);

  // Play sound when new reactions arrive
  const prevReactionCountRef = useRef(0);
  useEffect(() => {
    if (reactions.length > prevReactionCountRef.current && reactions.length > 0) {
      const latest = reactions[reactions.length - 1]!;
      playReactionSound(latest.emoji);
    }
    prevReactionCountRef.current = reactions.length;
  }, [reactions]);

  // Mute/unmute mic when singer sends mute-all
  // Snapshot pre-mute state so unmute only restores those who were unmuted before
  const wasMutedBySingerRef = useRef(false);
  const micWasOnBeforeMuteRef = useRef(false);
  useEffect(() => {
    if (mutedBySinger && !wasMutedBySingerRef.current) {
      wasMutedBySingerRef.current = true;
      micWasOnBeforeMuteRef.current = isMicEnabled;
      if (isMicEnabled) {
        // Use setMicMuted which handles both sharing (Web Audio mix) and non-sharing paths
        void setMicMuted(true);
      }
    }
    if (!mutedBySinger && wasMutedBySingerRef.current) {
      wasMutedBySingerRef.current = false;
      if (micWasOnBeforeMuteRef.current) {
        void setMicMuted(false);
      }
      micWasOnBeforeMuteRef.current = false;
    }
  }, [mutedBySinger, isMicEnabled, setMicMuted]);

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
      // Switch back to talking mode when done singing
      if (micMode === "raw") setMicMode("voice");
    }
    if (!isMyTurn) wasMyTurnRef.current = false;
  }, [isMyTurn, micMode, setMicMode]);

  // Send status updates (includes LiveKit identity + auto-mix state)
  useEffect(() => {
    if (!isPartyConnected) return;
    sendStatusUpdate({
      isMuted: !isMicEnabled,
      isSharingAudio: isSharing,
      currentSong,
      browser: browser.name + (browser.isMobile ? " (Mobile)" : ""),
      lkIdentity: lkIdentity ?? undefined,
      autoMix,
    });
  }, [isMicEnabled, isSharing, currentSong, isPartyConnected, sendStatusUpdate, browser, lkIdentity, autoMix]);

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

  // Kicked state - show banner and stop
  if (kicked) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center px-4">
        <div
          className="w-full max-w-sm rounded-xl border p-6 text-center"
          style={{ background: "var(--color-dark-surface)", borderColor: "var(--color-dark-border)" }}
        >
          <p className="mb-2 text-sm font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--color-danger)" }}>
            You were kicked by {kicked}
          </p>
          <p className="mb-4 text-xs" style={{ color: "var(--color-text-muted)" }}>
            You can no longer participate in this room.
          </p>
          <button
            onClick={() => router.push("/")}
            className="cursor-pointer rounded-lg px-6 py-2.5 text-xs font-bold transition-all hover:brightness-110"
            style={{ fontFamily: "var(--font-display)", background: "var(--color-primary)", color: "#fff" }}
          >
            Back to Home
          </button>
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

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden">
      {/* Audio unlock prompt — dismisses on first click to satisfy autoplay policy */}
      <AudioUnlockOverlay />

      {/* Ambient background — driven by audio visualizer when someone sings */}
      <div
        id="ambient-bg"
        className="pointer-events-none fixed inset-0 transition-[background] duration-150"
        style={{
          background: "radial-gradient(ellipse 40% 40% at 20% 80%, var(--color-primary-dim), transparent), radial-gradient(ellipse 35% 35% at 80% 20%, var(--color-primary-dim), transparent)",
        }}
      />

      {/* Header */}
      <header
        className="relative z-10 flex shrink-0 items-center justify-between gap-2 border-b px-3 py-3 sm:px-5 lg:px-7"
        style={{ borderColor: "var(--color-dark-border)", background: "color-mix(in srgb, var(--color-dark-surface) 82%, transparent)" }}
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
          <div className="hidden h-7 w-px sm:block" style={{ background: "var(--color-dark-border)" }} />
          <div className="min-w-0">
            <InviteCode code={roomCode} />
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {/* Settings */}
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full transition-all hover:brightness-125 active:scale-95 sm:h-10 sm:w-10"
            style={{ background: "var(--color-dark-card)", color: "var(--color-text-primary)" }}
            title="Settings"
          >
            <SettingsIcon size={18} />
          </button>

          {/* Leave */}
          <button
            onClick={() => router.push("/")}
            className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-xs font-semibold transition-all hover:brightness-110 active:scale-95 sm:px-4 sm:text-sm"
            style={{ fontFamily: "var(--font-display)", background: "#b40712", color: "#fff" }}
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">Exit Room</span>
          </button>
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
            <button
              onClick={() => router.push("/")}
              className="cursor-pointer rounded-md px-3 py-1.5 text-[11px] font-medium transition-all hover:brightness-110"
              style={{ background: "var(--color-danger)", color: "var(--color-text-primary)" }}
            >
              Create New Room
            </button>
            <button
              onClick={() => window.location.reload()}
              className="cursor-pointer rounded-md border px-3 py-1.5 text-[11px] font-medium transition-all hover:brightness-110"
              style={{ borderColor: "var(--color-danger)", color: "var(--color-danger)" }}
            >
              Try Again
            </button>
          </div>
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

      {/* Browser warning */}
      {!browser.canSing && (
        <div
          className="relative z-10 mx-4 mt-2 rounded-lg px-3 py-2 text-xs lg:mx-6"
          style={{ background: "var(--color-accent-dim)", color: "var(--color-accent)" }}
        >
          {browser.isMobile
            ? "Mobile detected — you can listen and chat, but singing requires a desktop Chromium browser."
            : `${browser.name} detected — singing requires a Chromium browser (Chrome, Edge, Brave, Arc...).`}
        </div>
      )}

      {/* Main content */}
      <div
        className="relative z-10 mx-auto flex min-h-0 w-full max-w-[1680px] flex-1 flex-col gap-2 overflow-hidden p-2 lg:flex-row lg:gap-3 lg:p-4 xl:gap-4"
      >
        {/* Mobile section switcher */}
        <div className="grid shrink-0 grid-cols-3 gap-1 rounded-lg border p-1 lg:hidden" style={{ borderColor: "var(--color-dark-border)", background: "var(--color-dark-surface)" }}>
          {[
            { key: "stage", label: "Stage" },
            { key: "chat", label: "Chat" },
            { key: "people", label: "People" },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => setMobileSection(item.key as "stage" | "chat" | "people")}
              className="rounded-md px-2 py-2 text-xs font-semibold transition-all"
              style={{
                fontFamily: "var(--font-display)",
                background: mobileSection === item.key ? "var(--color-primary-dim)" : "transparent",
                color: mobileSection === item.key ? "var(--color-primary)" : "var(--color-text-muted)",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Left rail: participants and singer queue */}
        <aside className={`min-h-0 w-full flex-1 flex-col overflow-hidden lg:flex lg:w-64 lg:flex-none lg:shrink-0 xl:w-72 ${mobileSection === "people" ? "flex" : "hidden"}`}>
          <PeoplePanel
            roomState={roomState}
            myPeerId={myPeerId}
            onRequestJoinQueue={() => setJoinQueueModalOpen(true)}
            onLeaveQueue={leaveQueue}
            canSing={browser.canSing}
            participantStatus={participantStatus}
            activeSpeakers={activeSpeakers}
            personVolumes={personVolumes}
            onPersonVolumeChange={handlePersonVolumeChange}
            onKick={isAdmin ? sendKick : undefined}
            onTransferAdmin={isAdmin ? sendTransferAdmin : undefined}
          />
        </aside>

        {/* Center stage */}
        <section className={`min-h-0 min-w-0 flex-1 flex-col gap-3 ${mobileSection === "stage" ? "flex" : "hidden"} lg:flex`}>
          <div
            className={`relative flex min-h-0 flex-1 flex-col justify-center overflow-y-auto rounded-2xl border ${roomState.currentSingerId ? "p-0" : "p-3 sm:p-5"}`}
            style={{
              background: roomState.currentSingerId
                ? "transparent"
                : "radial-gradient(circle at 50% 10%, var(--color-primary-dim), transparent 55%), var(--color-dark-surface)",
              borderColor: roomState.currentSingerId ? "transparent" : "var(--color-dark-border)",
            }}
          >
            <StageBanner
              room={room}
              roomState={roomState}
              isMyTurn={isMyTurn}
              isSharing={isSharing}
              onStartSharing={startSharing}
              onStopSharing={stopSharing}
              onFinishSinging={finishSinging}
              audioError={sharingError}
              singerSongName={
                roomState.currentSingerId
                  ? participantStatus[roomState.currentSingerId]?.currentSong ?? null
                  : null
              }
              canSing={browser.canSing}
              onAddToQueue={
                roomState.queue.length === 0 && !isMyTurn && browser.canSing
                  ? () => setJoinQueueModalOpen(true)
                  : undefined
              }
              musicVolume={musicVolume}
              onMusicVolumeChange={(vol: number) => {
                setMusicVolume(vol);
                if (roomState.currentSingerId) {
                  const singerStatus = participantStatus[roomState.currentSingerId];
                  const singerId = singerStatus?.lkIdentity ?? roomState.participants.find((p) => p.id === roomState.currentSingerId)?.name ?? "";
                  if (singerId) setPersonVolumes((prev) => ({ ...prev, [singerId]: vol }));
                }
              }}
              onMixMicGain={(v) => { setMixMicGain(v); setMixVoiceValue(Math.round(v * 100)); broadcastMix(v, mixMusicValue / 100); }}
              onMixMusicGain={(v) => { setMixMusicGain(v); setMixMusicValue(Math.round(v * 100)); broadcastMix(mixVoiceValue / 100, v); }}
              mixVoiceValue={autoMixBoostedVoice ?? mixVoiceValue}
              mixMusicValue={autoMixDuckedValue ?? mixMusicValue}
              ambientId="ambient-bg"
              ambientColor="violet"
              onMuteAll={() => { sendMuteAll(); setSingerMutedAll(true); }}
              onUnmuteAll={() => { sendUnmuteAll(); setSingerMutedAll(false); }}
              isMutedAll={singerMutedAll}
              singerAutoMix={roomState.currentSingerId ? participantStatus[roomState.currentSingerId]?.autoMix : false}
              onMixAdjust={!isMyTurn ? sendMixAdjust : undefined}
              onMixAdjustDone={!isMyTurn ? (voice, music) => {
                sendChat(`adjusted mix - Voice ${Math.round(voice * 100)}%, Music ${Math.round(music * 100)}%`);
              } : undefined}
              autoMix={autoMix}
              onAutoMixChange={isSharing ? (on) => { setAutoMix(on); sendChat(on ? "enabled Auto Mix" : "disabled Auto Mix"); } : undefined}
              recordingState={recordingState}
              recordingDuration={recordingDuration}
              onStartRecording={startRecording}
              onStopRecording={stopRecording}
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
                      className="flex max-w-[min(14rem,calc(100vw-2rem))] items-center gap-2 rounded-full border px-3.5 py-2 backdrop-blur-md will-change-transform"
                      style={{
                        animation: "reaction-bubble-float 3s cubic-bezier(0.22, 1, 0.36, 1) forwards",
                        background: "color-mix(in srgb, var(--color-dark-surface) 88%, transparent)",
                        borderColor: "color-mix(in srgb, var(--color-text-primary) 12%, transparent)",
                        boxShadow: "0 12px 32px rgba(0, 0, 0, 0.38)",
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
                      className="flex w-fit max-w-full items-baseline gap-2 rounded-2xl border px-4 py-2.5 backdrop-blur-md will-change-transform"
                      style={{
                        animation: "chat-bubble-float 4s cubic-bezier(0.22, 1, 0.36, 1) forwards",
                        background: "color-mix(in srgb, var(--color-dark-surface) 92%, transparent)",
                        borderColor: "color-mix(in srgb, var(--color-primary) 30%, var(--color-dark-border))",
                        boxShadow: "0 14px 36px rgba(0, 0, 0, 0.42)",
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
            room={room}
            isMicEnabled={isMicEnabled}
            toggleMic={toggleMic}
            micVolume={mixVoiceValue}
            onMicVolumeChange={(volume) => {
              const gain = volume / 100;
              setMixVoiceValue(volume);
              setMixMicGain(gain);
              if (isMyTurn) broadcastMix(gain, mixMusicValue / 100);
            }}
            voiceEffect={voiceEffect}
            onVoiceEffectChange={setVoiceEffect}
            onEffectWetDry={setEffectWetDry}
            noiseCancellationMode={noiseCancellationMode}
            onNoiseCancellationModeChange={setNoiseCancellationMode}
            onSoundProfileOpen={() => setSoundProfileOpen(true)}
          />
        </section>

        {/* Right rail: room chat */}
        <aside className={`min-h-0 w-full flex-1 overflow-hidden lg:block lg:w-72 lg:flex-none lg:shrink-0 xl:w-80 ${mobileSection === "chat" ? "block" : "hidden"}`}>
          <ChatPanel
            messages={chatMessages}
            onSend={sendChat}
            myPeerId={myPeerId}
            onReact={sendReaction}
          />
        </aside>
      </div>

      {/* Shared join-queue flow */}
      <JoinQueueModal
        open={joinQueueModalOpen}
        onClose={() => setJoinQueueModalOpen(false)}
        onJoin={joinQueue}
        onSetSongIntent={(song) => {
          sendStatusUpdate({
            isMuted: !isMicEnabled,
            isSharingAudio: isSharing,
            currentSong: song,
            browser: browser.name + (browser.isMobile ? " (Mobile)" : ""),
            lkIdentity: lkIdentity ?? undefined,
            autoMix,
          });
        }}
      />

      {/* Settings drawer */}
      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        voiceVolume={voiceVolume}
        onVoiceVolumeChange={setVoiceVolume}
        displayName={playerName}
        onRename={onRename}
        isAdmin={isAdmin}
        isLocked={roomState.isLocked}
        onSetPassword={isAdmin ? sendSetPassword : undefined}
      />

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

      {/* Recording download modal */}
      {recordingBlob && recordingState === "stopped" && (
        <RecordingModal
          open
          blob={recordingBlob}
          duration={recordingDuration}
          songName={currentSong}
          onClose={clearRecording}
        />
      )}

    </main>
  );
}

function AudioUnlockOverlay() {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex cursor-pointer items-center justify-center"
      style={{ background: "rgba(9, 9, 11, 0.85)" }}
      onClick={() => setVisible(false)}
    >
      <div className="text-center" style={{ animation: "fade-in 0.3s ease-out" }}>
        <p
          className="text-xl font-bold"
          style={{ fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}
        >
          Click to enter room
        </p>
        <p className="mt-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
          This enables audio playback
        </p>
      </div>
    </div>
  );
}
