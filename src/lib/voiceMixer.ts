/**
 * Local voice mixer for karaoke - pure Web Audio API, zero dependencies.
 *
 * Every remote voice runs through the same graph:
 *   source -> personGain -> masterBus -> duck -> limiter -> output
 *
 * INVARIANT: every value in this module is local to this device. Nothing here is
 * ever broadcast over PartyKit or LiveKit, so one listener's mix cannot move another's.
 *
 * The page's short UI sounds (stage chime, reaction pops) render into this context too,
 * on their own bus: they were two module-level contexts that were never closed, and a
 * phone pays for every render thread.
 */

import { isIOSDevice } from "./audioRoutes";

export const MASTER_MAX = 2;
export const PERSON_MAX = 2;

const GAIN_RAMP_SEC = 0.015;
const LIMITER_THRESHOLD_DB = -1;
const LIMITER_KNEE_DB = 6;
const LIMITER_RATIO = 20;
const LIMITER_ATTACK_SEC = 0.003;
const LIMITER_RELEASE_SEC = 0.25;
const SINK_ELEMENT_ID = "karaoke-mix-sink";
// WebKit parks resume() instead of rejecting while the session is interrupted, so the
// context state decides the outcome rather than the promise. Same idiom as the mic check.
const CTX_RESUME_TIMEOUT_MS = 400;
// Every context in the app is pinned, so a graph first built while a 16 kHz Bluetooth
// mic owns the route still mixes at the rate the singer path publishes.
const GRAPH_SAMPLE_RATE = 48000;

interface MixChain {
  identity: string;
  element: HTMLAudioElement | null;
  // Kept so a rebuilt graph can re-source the same remote track without LiveKit
  // re-attaching it: a context that iOS interrupted can only be replaced, not resumed.
  track: MediaStreamTrack;
  stream: MediaStream | null;
  source: MediaStreamAudioSourceNode | null;
  gain: GainNode | null;
}

type SinkCapableContext = AudioContext & { setSinkId?: (deviceId: string) => Promise<void> };

/** Where a one-shot UI sound renders: the mixer's context and its own bus. */
export interface SfxTarget {
  ctx: AudioContext;
  destination: AudioNode;
}

export interface VoiceMixer {
  // The element is the fallback sink: the mixer keeps it silent while the graph is
  // audible and hands the mix back to it when Web Audio fails or the context stalls
  attach: (identity: string, track: MediaStreamTrack, trackSid: string, element: HTMLAudioElement | null) => boolean;
  detach: (trackSid: string) => void;
  setPersonGains: (gains: Record<string, number>) => void;
  setMaster: (value: number) => void;
  setDuck: (value: number) => void;
  setSinkId: (deviceId: string) => void;
  // Resolves once the graph is audible again or the rebuild has been tried, so the
  // caller's gesture can finish the recovery (element sweep, startAudio) after it
  resume: () => Promise<void>;
  // Re-assert element mute/volume after something outside the mixer touched them
  syncElements: () => void;
  // The chime and the reaction sounds render here. Null while there is no context to
  // render into; the bus sits beside the master bus, so no voice control moves it.
  sfxTarget: () => SfxTarget | null;
  // True while a live remote voice is riding its <audio> element on an engine that
  // ignores element.volume, which is exactly when the volume sliders are inert.
  volumeControlLost: () => boolean;
  subscribe: (listener: () => void) => () => void;
  destroy: () => void;
}

// iOS/iPadOS WebKit ignores every write to HTMLMediaElement.volume. Read once: the
// answer cannot change for the life of the document and useSyncExternalStore polls it.
let elementVolumeIgnored: boolean | null = null;
function ignoresElementVolume(): boolean {
  if (elementVolumeIgnored === null) elementVolumeIgnored = isIOSDevice();
  return elementVolumeIgnored;
}

function clampGain(value: number, max: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0, Math.min(max, value));
}

export function createVoiceMixer(): VoiceMixer {
  const chains = new Map<string, MixChain>();

  let ctx: AudioContext | null = null;
  let masterNode: GainNode | null = null;
  let duckNode: GainNode | null = null;
  let limiterNode: DynamicsCompressorNode | null = null;
  let sfxNode: GainNode | null = null;
  let streamSink: MediaStreamAudioDestinationNode | null = null;
  let sinkElement: HTMLAudioElement | null = null;

  let personGains: Record<string, number> = {};
  let masterValue = 1;
  let duckValue = 1;
  let sinkId = "";
  // A context that has never run is waiting for a gesture, which is the autoplay
  // policy rather than a fault: only one that has been audible before is worth rebuilding.
  let everRunning = false;
  let resumeInFlight: Promise<void> | null = null;
  // Bumped by destroy, so a resume still waiting on its timeout cannot rebuild a graph
  // for a room that is already gone. The mixer outlives one connection, so a permanent
  // flag would be wrong: a later attach has to be able to build again.
  let generation = 0;
  let volumeLost = false;
  const listeners = new Set<() => void>();

  const ramp = (param: AudioParam, value: number) => {
    if (!ctx) return;
    param.setTargetAtTime(value, ctx.currentTime, GAIN_RAMP_SEC);
  };

  // LiveKit identities carry a per-connection suffix, so an exact miss falls back
  // to the "name-suffix" form the caller may have keyed the map by.
  const resolveGain = (identity: string): number => {
    const exact = personGains[identity];
    if (exact !== undefined) return clampGain(exact, PERSON_MAX);
    for (const key of Object.keys(personGains)) {
      if (key && identity.startsWith(`${key}-`)) return clampGain(personGains[key] ?? 1, PERSON_MAX);
    }
    return 1;
  };

  const graphAudible = (): boolean => ctx !== null && ctx.state === "running";

  // Element volume is the fallback path: it carries the full local mix whenever the
  // graph is not audible, so a suspended context can never mean a silent room.
  // INVARIANT: silencing goes through `muted`, never `volume` alone - iOS/iPadOS
  // WebKit ignores volume writes, so a volume-only mute doubles every remote voice.
  const syncElements = () => {
    const audible = graphAudible();
    let onElement = false;
    for (const chain of chains.values()) {
      const el = chain.element;
      if (!el) continue;
      const useGraph = audible && chain.gain !== null;
      if (!useGraph) onElement = true;
      const level = useGraph ? 0 : Math.min(1, resolveGain(chain.identity) * masterValue * duckValue);
      // A zero on the fallback path goes through `muted`, the one lever iOS honours:
      // per-person mute, deafen and the mic-check duck all resolve to level 0 here.
      el.muted = useGraph || level === 0;
      el.volume = level;
    }
    // The fallback carries the mix in element.volume, so where that write is a no-op
    // every slider is inert and only `muted` still does anything. The UI has to say so.
    const lost = onElement && ignoresElementVolume();
    if (lost === volumeLost) return;
    volumeLost = lost;
    for (const listener of listeners) listener();
  };

  const contextSupportsSink = (candidate: AudioContext): boolean =>
    typeof (candidate as SinkCapableContext).setSinkId === "function";

  const removeSinkElement = () => {
    if (!sinkElement) return;
    sinkElement.pause();
    sinkElement.srcObject = null;
    sinkElement.remove();
    sinkElement = null;
  };

  const routeOutput = () => {
    if (!ctx || !limiterNode) return;
    limiterNode.disconnect();

    const elementSinkSupported = typeof window !== "undefined"
      && typeof HTMLAudioElement.prototype.setSinkId === "function";
    const needsElementSink = sinkId !== "" && !contextSupportsSink(ctx) && elementSinkSupported;

    if (needsElementSink) {
      if (!streamSink) streamSink = ctx.createMediaStreamDestination();
      if (!sinkElement) {
        sinkElement = document.createElement("audio");
        sinkElement.id = SINK_ELEMENT_ID;
        sinkElement.autoplay = true;
        sinkElement.style.display = "none";
        document.body.appendChild(sinkElement);
      }
      limiterNode.connect(streamSink);
      if (sinkElement.srcObject !== streamSink.stream) sinkElement.srcObject = streamSink.stream;
      void sinkElement.setSinkId(sinkId).catch(() => {});
      void sinkElement.play().catch(() => {});
      return;
    }

    limiterNode.connect(ctx.destination);
    removeSinkElement();
    if (sinkId && contextSupportsSink(ctx)) {
      void (ctx as SinkCapableContext).setSinkId?.(sinkId).catch(() => {});
    }
  };

  const onStateChange = () => {
    if (ctx?.state === "running") everRunning = true;
    syncElements();
  };

  const ensureGraph = (): AudioContext | null => {
    if (ctx && ctx.state !== "closed") return ctx;
    if (typeof window === "undefined") return null;

    try {
      ctx = new AudioContext({ sampleRate: GRAPH_SAMPLE_RATE });
    } catch {
      // An engine that cannot open 48 kHz at all: a resampled graph still mixes, and
      // the hardware rate beats handing the whole room back to the element fallback.
      try {
        ctx = new AudioContext();
      } catch {
        ctx = null;
        return null;
      }
    }
    if (ctx.state === "running") everRunning = true;
    ctx.addEventListener("statechange", onStateChange);

    masterNode = ctx.createGain();
    masterNode.gain.value = masterValue;
    duckNode = ctx.createGain();
    duckNode.gain.value = duckValue;
    limiterNode = ctx.createDynamicsCompressor();
    limiterNode.threshold.value = LIMITER_THRESHOLD_DB;
    limiterNode.knee.value = LIMITER_KNEE_DB;
    limiterNode.ratio.value = LIMITER_RATIO;
    limiterNode.attack.value = LIMITER_ATTACK_SEC;
    limiterNode.release.value = LIMITER_RELEASE_SEC;

    masterNode.connect(duckNode);
    duckNode.connect(limiterNode);
    // UI sounds join after the duck, so a mic check that ducks the room and a muted
    // person both leave the chime where it was. The limiter is shared on purpose:
    // it is the one node that exists to keep the summed output from clipping.
    sfxNode = ctx.createGain();
    sfxNode.connect(limiterNode);
    streamSink = null;
    routeOutput();
    return ctx;
  };

  const connectChain = (chain: MixChain) => {
    if (!ctx || !masterNode) return;
    try {
      const stream = chain.stream ?? new MediaStream([chain.track]);
      const source = ctx.createMediaStreamSource(stream);
      const gain = ctx.createGain();
      gain.gain.value = resolveGain(chain.identity);
      source.connect(gain);
      gain.connect(masterNode);
      chain.stream = stream;
      chain.source = source;
      chain.gain = gain;
    } catch {
      // graph unavailable for this track, the element keeps carrying it
      chain.source = null;
      chain.gain = null;
    }
  };

  // Drops the context and every node but keeps the chains, so the elements the mixer
  // owns stay attached and carry the full local mix for the length of the rebuild.
  const teardownGraph = () => {
    for (const chain of chains.values()) {
      chain.source?.disconnect();
      chain.gain?.disconnect();
      chain.source = null;
      chain.gain = null;
    }
    ctx?.removeEventListener("statechange", onStateChange);
    masterNode?.disconnect();
    duckNode?.disconnect();
    limiterNode?.disconnect();
    sfxNode?.disconnect();
    removeSinkElement();
    const dead = ctx;
    ctx = null;
    masterNode = null;
    duckNode = null;
    limiterNode = null;
    sfxNode = null;
    streamSink = null;
    // After the refs are cleared: syncElements reads them, and every element has to be
    // carrying the mix before the old context stops feeding the graph
    syncElements();
    if (dead && dead.state !== "closed") void dead.close().catch(() => {});
  };

  const rebuildGraph = (): AudioContext | null => {
    teardownGraph();
    const fresh = ensureGraph();
    if (!fresh) return null;
    for (const chain of chains.values()) connectChain(chain);
    syncElements();
    return fresh;
  };

  // resume() rejects on some iOS builds and simply never settles while the session is
  // interrupted, so the state after a bounded wait is the only trustworthy answer.
  const tryResume = async (audioCtx: AudioContext): Promise<{ running: boolean; rejected: boolean }> => {
    let rejected = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      audioCtx.resume().catch(() => { rejected = true; }),
      new Promise<void>((resolve) => { timer = setTimeout(resolve, CTX_RESUME_TIMEOUT_MS); }),
    ]);
    clearTimeout(timer);
    const running = audioCtx.state === "running";
    if (running) everRunning = true;
    return { running, rejected };
  };

  const runResume = async () => {
    const gen = generation;
    let audioCtx = ensureGraph();
    if (!audioCtx) return;
    if (audioCtx.state !== "running") {
      // Read before the await, while the answer is still about this call: WebKit rejects
      // resume() with no user activation, so a rejection is only evidence of a broken
      // context when there was an activation to spend.
      const hadActivation = navigator.userActivation?.isActive === true;
      const { running, rejected } = await tryResume(audioCtx);
      if (gen !== generation) return;
      // A context iOS moved to interrupted and back cannot be resumed at all: the only
      // recovery is a new one. A context that has never been audible is waiting for a
      // gesture instead, and rebuilding that would churn a graph on every attach.
      if (!running && (everRunning || (rejected && hadActivation))) {
        audioCtx = rebuildGraph();
        if (audioCtx && audioCtx.state !== "running") await tryResume(audioCtx);
      }
    }
    if (sinkElement?.paused) void sinkElement.play().catch(() => {});
    syncElements();
  };

  // Called from every user gesture, so the context is built inside one where iOS demands it.
  // One run at a time: two overlapping recoveries would each rebuild the other's graph.
  const resume = (): Promise<void> => {
    // The cheap half runs on every call, in flight or not. A caller that arrives with a
    // user activation has to spend it on ctx.resume() itself: the run it would otherwise
    // be handed already made its one attempt, off-gesture, and cannot make another.
    const live = ensureGraph();
    if (live && live.state !== "running") void live.resume().catch(() => {});
    if (resumeInFlight) return resumeInFlight;
    const run = runResume().finally(() => { resumeInFlight = null; });
    resumeInFlight = run;
    return run;
  };

  const detach = (trackSid: string) => {
    const chain = chains.get(trackSid);
    if (!chain) return;
    chain.source?.disconnect();
    chain.gain?.disconnect();
    // syncElements only walks live chains, so an element the mixer stops owning
    // has to be left inert or it keeps playing that voice unmixed
    if (chain.element) {
      chain.element.muted = true;
      chain.element.volume = 0;
    }
    chains.delete(trackSid);
    // The chain set decides volumeControlLost, and this is the one mutation of it that
    // does not already re-run the pass: without it the last voice leaving keeps the UI
    // in mute-only with no remote voice left to explain it.
    syncElements();
  };

  const attach = (identity: string, track: MediaStreamTrack, trackSid: string, element: HTMLAudioElement | null): boolean => {
    detach(trackSid);
    if (element) element.muted = true;
    const chain: MixChain = { identity, element, track, stream: null, source: null, gain: null };
    ensureGraph();
    connectChain(chain);

    chains.set(trackSid, chain);
    void resume();
    return chain.gain !== null;
  };

  const setPersonGains = (gains: Record<string, number>) => {
    personGains = gains;
    for (const chain of chains.values()) {
      if (chain.gain) ramp(chain.gain.gain, resolveGain(chain.identity));
    }
    syncElements();
  };

  const setMaster = (value: number) => {
    masterValue = clampGain(value, MASTER_MAX);
    if (masterNode) ramp(masterNode.gain, masterValue);
    syncElements();
  };

  const setDuck = (value: number) => {
    duckValue = clampGain(value, 1);
    if (duckNode) ramp(duckNode.gain, duckValue);
    syncElements();
  };

  // Built on demand rather than resumed through the recovery path: a chime is not worth
  // a graph rebuild, and the join gesture has already spent its activation on the mixer.
  const sfxTarget = (): SfxTarget | null => {
    const live = ensureGraph();
    if (!live || !sfxNode) return null;
    // currentTime does not advance while the context is not running, so a sound scheduled
    // now would be queued rather than played, and every queued one would fire together on
    // the next resume. A one-shot cue is worth dropping instead.
    if (live.state !== "running") {
      void live.resume().catch(() => {});
      return null;
    }
    return { ctx: live, destination: sfxNode };
  };

  const volumeControlLost = () => volumeLost;

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  };

  const setSinkId = (deviceId: string) => {
    sinkId = deviceId;
    if (ctx && ctx.state !== "closed") routeOutput();
  };

  const destroy = () => {
    const elements = Array.from(chains.values()).map((chain) => chain.element);
    for (const trackSid of Array.from(chains.keys())) detach(trackSid);
    for (const el of elements) {
      if (!el) continue;
      el.muted = false;
      el.volume = 1;
    }
    teardownGraph();
    everRunning = false;
    generation += 1;
    resumeInFlight = null;
  };

  return { attach, detach, setPersonGains, setMaster, setDuck, setSinkId, resume, syncElements, sfxTarget, volumeControlLost, subscribe, destroy };
}
