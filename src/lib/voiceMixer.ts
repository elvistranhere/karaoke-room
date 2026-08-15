/**
 * Local voice mixer for karaoke - pure Web Audio API, zero dependencies.
 *
 * Every remote voice runs through the same graph:
 *   source -> personGain -> masterBus -> duck -> limiter -> output
 *
 * INVARIANT: every value in this module is local to this device. Nothing here is
 * ever broadcast over PartyKit or LiveKit, so one listener's mix cannot move another's.
 */

export const MASTER_MAX = 2;
export const PERSON_MAX = 2;

const GAIN_RAMP_SEC = 0.015;
const LIMITER_THRESHOLD_DB = -1;
const LIMITER_KNEE_DB = 6;
const LIMITER_RATIO = 20;
const LIMITER_ATTACK_SEC = 0.003;
const LIMITER_RELEASE_SEC = 0.25;
const SINK_ELEMENT_ID = "karaoke-mix-sink";

interface MixChain {
  identity: string;
  element: HTMLAudioElement | null;
  stream: MediaStream | null;
  source: MediaStreamAudioSourceNode | null;
  gain: GainNode | null;
}

type SinkCapableContext = AudioContext & { setSinkId?: (deviceId: string) => Promise<void> };

export interface VoiceMixer {
  // The element is the fallback sink: the mixer keeps it silent while the graph is
  // audible and hands the mix back to it when Web Audio fails or the context stalls
  attach: (identity: string, track: MediaStreamTrack, trackSid: string, element: HTMLAudioElement | null) => boolean;
  detach: (trackSid: string) => void;
  setPersonGains: (gains: Record<string, number>) => void;
  setMaster: (value: number) => void;
  setDuck: (value: number) => void;
  setSinkId: (deviceId: string) => void;
  resume: () => void;
  destroy: () => void;
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
  let streamSink: MediaStreamAudioDestinationNode | null = null;
  let sinkElement: HTMLAudioElement | null = null;

  let personGains: Record<string, number> = {};
  let masterValue = 1;
  let duckValue = 1;
  let sinkId = "";

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
  const syncElements = () => {
    const audible = graphAudible();
    for (const chain of chains.values()) {
      const el = chain.element;
      if (!el) continue;
      el.volume = audible && chain.gain !== null
        ? 0
        : Math.min(1, resolveGain(chain.identity) * masterValue * duckValue);
    }
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

  const ensureGraph = (): AudioContext | null => {
    if (ctx && ctx.state !== "closed") return ctx;
    if (typeof window === "undefined") return null;

    try {
      ctx = new AudioContext();
    } catch {
      ctx = null;
      return null;
    }
    ctx.addEventListener("statechange", syncElements);

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
    streamSink = null;
    routeOutput();
    return ctx;
  };

  // Called from every user gesture, so the context is built inside one where iOS demands it
  const resume = () => {
    const audioCtx = ensureGraph();
    if (audioCtx && audioCtx.state !== "running") void audioCtx.resume().catch(() => {});
    if (sinkElement?.paused) void sinkElement.play().catch(() => {});
    syncElements();
  };

  const detach = (trackSid: string) => {
    const chain = chains.get(trackSid);
    if (!chain) return;
    chain.source?.disconnect();
    chain.gain?.disconnect();
    chains.delete(trackSid);
  };

  const attach = (identity: string, track: MediaStreamTrack, trackSid: string, element: HTMLAudioElement | null): boolean => {
    detach(trackSid);
    const audioCtx = ensureGraph();
    const master = masterNode;
    let chain: MixChain = { identity, element, stream: null, source: null, gain: null };

    if (audioCtx && master) {
      try {
        const stream = new MediaStream([track]);
        const source = audioCtx.createMediaStreamSource(stream);
        const gain = audioCtx.createGain();
        gain.gain.value = resolveGain(identity);
        source.connect(gain);
        gain.connect(master);
        chain = { identity, element, stream, source, gain };
      } catch {
        // graph unavailable for this track, the element keeps carrying it
      }
    }

    chains.set(trackSid, chain);
    resume();
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

  const setSinkId = (deviceId: string) => {
    sinkId = deviceId;
    if (ctx && ctx.state !== "closed") routeOutput();
  };

  const destroy = () => {
    for (const chain of chains.values()) {
      if (chain.element) chain.element.volume = 1;
    }
    for (const trackSid of Array.from(chains.keys())) detach(trackSid);
    ctx?.removeEventListener("statechange", syncElements);
    masterNode?.disconnect();
    duckNode?.disconnect();
    limiterNode?.disconnect();
    removeSinkElement();
    if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {});
    ctx = null;
    masterNode = null;
    duckNode = null;
    limiterNode = null;
    streamSink = null;
  };

  return { attach, detach, setPersonGains, setMaster, setDuck, setSinkId, resume, destroy };
}
