import { describe, expect, it } from "vitest";
import {
  clampGain,
  parseStoredVolumes,
  personMixKey,
  resolveGains,
  serializeStoredVolumes,
  trackIdentities,
  ANON_KEY_PREFIX,
  DEFAULT_MASTER,
  DEFAULT_MUSIC,
  DEFAULT_PERSON_MIX,
  MAX_STORED_PEOPLE,
  MAX_TRACKED_IDENTITIES,
  type PersonMix,
  type ResolveGainsInput,
  type TrackedPerson,
} from "~/lib/volumeModel";
import { MASTER_MAX, PERSON_MAX } from "~/lib/voiceMixer";

const mix = (overrides: Partial<PersonMix> = {}): PersonMix => ({ ...DEFAULT_PERSON_MIX, ...overrides });

const person = (peerId: string, key: string): TrackedPerson => ({ peerId, key });

function gainsFor(overrides: Partial<ResolveGainsInput> = {}) {
  return resolveGains({
    people: {},
    tracked: new Map(),
    master: 1,
    music: 0.7,
    currentSingerId: null,
    micChecking: false,
    deafened: false,
    ...overrides,
  });
}

describe("personMixKey", () => {
  it("keys named participants by name so the mix survives a reconnect", () => {
    expect(personMixKey({ id: "peer-1", name: "Elvis" })).toBe("Elvis");
  });

  it("keys every flavour of Anonymous per peer", () => {
    expect(personMixKey({ id: "peer-1", name: "Anonymous" })).toBe(`${ANON_KEY_PREFIX}peer-1`);
    expect(personMixKey({ id: "peer-2", name: "  anonymous " })).toBe(`${ANON_KEY_PREFIX}peer-2`);
    expect(personMixKey({ id: "peer-3", name: "ANONYMOUS" })).toBe(`${ANON_KEY_PREFIX}peer-3`);
  });

  it("does not treat a name that merely contains anonymous as anonymous", () => {
    expect(personMixKey({ id: "peer-4", name: "Anonymous Rex" })).toBe("Anonymous Rex");
  });
});

describe("clampGain", () => {
  it("clamps into range", () => {
    expect(clampGain(-1, PERSON_MAX)).toBe(0);
    expect(clampGain(5, PERSON_MAX)).toBe(PERSON_MAX);
    expect(clampGain(0.5, 1)).toBe(0.5);
  });

  it("falls back to unity on non-finite input so nobody is silenced by a corrupt value", () => {
    expect(clampGain(Number.NaN, PERSON_MAX)).toBe(1);
    expect(clampGain(Number.POSITIVE_INFINITY, MASTER_MAX)).toBe(1);
    expect(clampGain(Number.NaN, 0.5)).toBe(0.5);
  });
});

describe("resolveGains person gains", () => {
  const tracked = new Map([["elvis-044ef3d6", person("peer-1", "Elvis")]]);

  it("gives a listener their talk level and the singer their stage level", () => {
    const people = { Elvis: mix({ talk: 0.4, stage: 1.6 }) };
    expect(gainsFor({ people, tracked }).people["elvis-044ef3d6"]).toBe(0.4);
    expect(gainsFor({ people, tracked, currentSingerId: "peer-1" }).people["elvis-044ef3d6"]).toBe(1.6);
  });

  it("switches back to talk when the singer leaves the stage", () => {
    const people = { Elvis: mix({ talk: 0.4, stage: 1.6 }) };
    const onStage = gainsFor({ people, tracked, currentSingerId: "peer-1" });
    const offStage = gainsFor({ people, tracked, currentSingerId: "peer-9" });
    expect(onStage.people["elvis-044ef3d6"]).toBe(1.6);
    expect(offStage.people["elvis-044ef3d6"]).toBe(0.4);
  });

  it("mutes to zero on stage and off", () => {
    const people = { Elvis: mix({ talk: 0.4, stage: 1.6, muted: true }) };
    expect(gainsFor({ people, tracked }).people["elvis-044ef3d6"]).toBe(0);
    expect(gainsFor({ people, tracked, currentSingerId: "peer-1" }).people["elvis-044ef3d6"]).toBe(0);
  });

  it("defaults an untouched person to unity", () => {
    expect(gainsFor({ tracked }).people["elvis-044ef3d6"]).toBe(1);
  });

  it("clamps a stored value that is out of range", () => {
    const people = { Elvis: mix({ talk: 99, stage: -3 }) };
    expect(gainsFor({ people, tracked }).people["elvis-044ef3d6"]).toBe(PERSON_MAX);
    expect(gainsFor({ people, tracked, currentSingerId: "peer-1" }).people["elvis-044ef3d6"]).toBe(0);
  });

  it("also emits the name key so the mixer's suffix fallback applies before the roster lands", () => {
    const gains = gainsFor({ people: { Elvis: mix({ talk: 0.4, stage: 1.6 }) }, tracked: new Map() });
    expect(gains.people).toEqual({ Elvis: 0.4 });
  });

  it("never emits an anonymous mix key, which would collide across peers", () => {
    const people = { [`${ANON_KEY_PREFIX}peer-1`]: mix({ talk: 0.2 }) };
    const gains = gainsFor({ people, tracked: new Map([["anon-abc", person("peer-1", `${ANON_KEY_PREFIX}peer-1`)]]) });
    expect(gains.people[`${ANON_KEY_PREFIX}peer-1`]).toBeUndefined();
    expect(gains.people["anon-abc"]).toBe(0.2);
  });

  it("keeps identities that are no longer on the roster at their stored level", () => {
    const gains = gainsFor({
      people: { Elvis: mix({ talk: 0.3 }) },
      tracked: new Map([["elvis-old", person("peer-1", "Elvis")], ["elvis-new", person("peer-2", "Elvis")]]),
    });
    expect(gains.people["elvis-old"]).toBe(0.3);
    expect(gains.people["elvis-new"]).toBe(0.3);
  });

  it("stages only the live peer when an earlier session of the same person is still tracked", () => {
    const gains = gainsFor({
      people: { Elvis: mix({ talk: 0.2, stage: 2 }) },
      tracked: new Map([["elvis-old", person("peer-1", "Elvis")], ["elvis-new", person("peer-2", "Elvis")]]),
      currentSingerId: "peer-2",
    });
    expect(gains.people["elvis-old"]).toBe(0.2);
    expect(gains.people["elvis-new"]).toBe(2);
  });
});

describe("resolveGains master and music", () => {
  it("passes the master through and scales music by it", () => {
    const gains = gainsFor({ master: 0.5, music: 0.8 });
    expect(gains.master).toBe(0.5);
    expect(gains.music).toBeCloseTo(40, 10);
  });

  it("never lets a boosted master push music past the YouTube cap", () => {
    const gains = gainsFor({ master: MASTER_MAX, music: 1 });
    expect(gains.master).toBe(MASTER_MAX);
    expect(gains.music).toBe(100);
  });

  it("silences everything while deafened, people included", () => {
    const gains = gainsFor({
      people: { Elvis: mix({ talk: 0.4 }) },
      tracked: new Map([["elvis-1", person("peer-1", "Elvis")]]),
      master: 1.5,
      deafened: true,
    });
    expect(gains.master).toBe(0);
    expect(gains.music).toBe(0);
    // Person gains stay: the master bus is what goes silent, so unmuting restores the mix
    expect(gains.people["elvis-1"]).toBe(0.4);
  });

  it("drops the music during a mic check but leaves voices alone", () => {
    const gains = gainsFor({ master: 1, music: 0.9, micChecking: true });
    expect(gains.music).toBe(0);
    expect(gains.master).toBe(1);
  });

  it("clamps corrupt master and music values", () => {
    expect(gainsFor({ master: 99 }).master).toBe(MASTER_MAX);
    expect(gainsFor({ master: -1, music: 2 }).music).toBe(0);
    expect(gainsFor({ master: Number.NaN, music: 0.5 }).master).toBe(1);
  });
});

describe("trackIdentities", () => {
  it("maps a LiveKit identity to the peer and the mix key", () => {
    const tracked = trackIdentities(new Map(), [{ identity: "elvis-1", peerId: "peer-1", key: "Elvis" }]);
    expect([...tracked]).toEqual([["elvis-1", person("peer-1", "Elvis")]]);
  });

  it("falls back to the name while the identity is unknown", () => {
    const tracked = trackIdentities(new Map(), [{ identity: null, peerId: "peer-1", key: "Elvis" }]);
    expect(tracked.get("Elvis")).toEqual(person("peer-1", "Elvis"));
  });

  it("waits for a real identity before tracking an anonymous peer", () => {
    const tracked = trackIdentities(new Map(), [{ identity: null, peerId: "peer-1", key: `${ANON_KEY_PREFIX}peer-1` }]);
    expect(tracked.size).toBe(0);
  });

  it("keeps identities that dropped off the roster, since their track can outlive the socket", () => {
    const first = trackIdentities(new Map(), [{ identity: "elvis-1", peerId: "peer-1", key: "Elvis" }]);
    const second = trackIdentities(first, [{ identity: "nova-2", peerId: "peer-2", key: "Nova" }]);
    expect(second.get("elvis-1")).toEqual(person("peer-1", "Elvis"));
    expect(second.get("nova-2")).toEqual(person("peer-2", "Nova"));
  });

  it("re-seeing an identity moves it to the newest slot and takes the newest peer", () => {
    let tracked = trackIdentities(new Map(), [
      { identity: "a", peerId: "peer-a", key: "A" },
      { identity: "b", peerId: "peer-b", key: "B" },
    ]);
    tracked = trackIdentities(tracked, [{ identity: "a", peerId: "peer-a2", key: "A" }]);
    expect([...tracked.keys()]).toEqual(["b", "a"]);
    expect(tracked.get("a")).toEqual(person("peer-a2", "A"));
  });

  it("evicts the oldest identities past the cap", () => {
    let tracked = new Map<string, TrackedPerson>();
    for (let i = 0; i < MAX_TRACKED_IDENTITIES + 5; i++) {
      tracked = trackIdentities(tracked, [{ identity: `id-${i}`, peerId: `peer-${i}`, key: `Name ${i}` }]);
    }
    expect(tracked.size).toBe(MAX_TRACKED_IDENTITIES);
    expect(tracked.has("id-0")).toBe(false);
    expect(tracked.has(`id-${MAX_TRACKED_IDENTITIES + 4}`)).toBe(true);
  });

  it("does not mutate the map it was given", () => {
    const previous = new Map<string, TrackedPerson>();
    trackIdentities(previous, [{ identity: "elvis-1", peerId: "peer-1", key: "Elvis" }]);
    expect(previous.size).toBe(0);
  });
});

describe("parseStoredVolumes", () => {
  it("falls back to defaults for junk", () => {
    const fallback = { master: DEFAULT_MASTER, music: DEFAULT_MUSIC, people: {} };
    expect(parseStoredVolumes(null)).toEqual(fallback);
    expect(parseStoredVolumes("nope")).toEqual(fallback);
    expect(parseStoredVolumes(42)).toEqual(fallback);
    expect(parseStoredVolumes({})).toEqual(fallback);
  });

  it("reads a well-formed blob back", () => {
    expect(parseStoredVolumes({
      master: 1.2,
      music: 0.3,
      people: { Elvis: { talk: 0.5, stage: 1.4, muted: true } },
    })).toEqual({
      master: 1.2,
      music: 0.3,
      people: { Elvis: { talk: 0.5, stage: 1.4, muted: true } },
    });
  });

  it("drops legacy shared-name anonymous entries", () => {
    const parsed = parseStoredVolumes({
      people: {
        Anonymous: { talk: 0.1, stage: 0.1, muted: true },
        anonymous: { talk: 0.2, stage: 0.2, muted: false },
        [`${ANON_KEY_PREFIX}peer-1`]: { talk: 0.3, stage: 0.3, muted: false },
        Elvis: { talk: 0.4, stage: 0.4, muted: false },
      },
    });
    expect(Object.keys(parsed.people)).toEqual(["Elvis"]);
  });

  it("clamps and repairs corrupt person values", () => {
    const parsed = parseStoredVolumes({
      people: {
        Loud: { talk: 99, stage: -4, muted: "yes" },
        Broken: { talk: "abc" },
        Missing: {},
      },
    });
    expect(parsed.people.Loud).toEqual({ talk: PERSON_MAX, stage: 0, muted: false });
    expect(parsed.people.Broken).toEqual({ talk: 1, stage: 1, muted: false });
    expect(parsed.people.Missing).toEqual({ talk: 1, stage: 1, muted: false });
  });

  it("skips non-object person entries", () => {
    const parsed = parseStoredVolumes({ people: { Elvis: null, Nova: 3, Real: { talk: 0.5 } } });
    expect(Object.keys(parsed.people)).toEqual(["Real"]);
  });

  it("clamps master and music, and defaults them when non-finite", () => {
    expect(parseStoredVolumes({ master: 99, music: 99 })).toMatchObject({ master: MASTER_MAX, music: 1 });
    expect(parseStoredVolumes({ master: "loud", music: null })).toMatchObject({
      master: DEFAULT_MASTER,
      music: DEFAULT_MUSIC,
    });
  });
});

describe("serializeStoredVolumes", () => {
  it("never persists a per-peer anonymous key", () => {
    const stored = serializeStoredVolumes({
      master: 1,
      music: 0.7,
      people: { Elvis: mix(), [`${ANON_KEY_PREFIX}peer-1`]: mix({ talk: 0.2 }) },
    });
    expect(Object.keys(stored.people)).toEqual(["Elvis"]);
  });

  it("keeps only the most recent MAX_STORED_PEOPLE", () => {
    const people: Record<string, PersonMix> = {};
    for (let i = 0; i < MAX_STORED_PEOPLE + 10; i++) people[`Person ${i}`] = mix({ talk: i / 100 });
    const stored = serializeStoredVolumes({ master: 1, music: 0.7, people });
    expect(Object.keys(stored.people)).toHaveLength(MAX_STORED_PEOPLE);
    expect(stored.people["Person 0"]).toBeUndefined();
    expect(stored.people[`Person ${MAX_STORED_PEOPLE + 9}`]).toBeDefined();
  });

  it("round trips through parse", () => {
    const value = { master: 1.2, music: 0.4, people: { Elvis: mix({ talk: 0.5, muted: true }) } };
    expect(parseStoredVolumes(serializeStoredVolumes(value))).toEqual(value);
  });
});
