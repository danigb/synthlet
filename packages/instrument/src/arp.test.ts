import { createNoteStack } from "./_voices";
import { ArpConfig } from "./arp-config";
import {
  arpClear,
  ArpEvent,
  arpSilence,
  arpSoundHeld,
  arpStart,
  ArpState,
  arpStep,
  arpStop,
  createArpState,
} from "./arp";
import { xorshift32 } from "./test-random";

// The whole of the arp is assertable as data: `arpStep` takes a time and
// returns the writes, so an arpeggio is a list. That is the same seam
// `mono.ts` has, and it is why none of this needs an `AudioContext`.

const SAMPLE_RATE = 48000;
/** The release lands one sample early, so the gate is seen to fall. */
const justBefore = (time: number) => time - 1 / SAMPLE_RATE;

function setup(
  pressed: ([number, number] | number)[] = [],
  { latch = false, seed = 1, capacity = 16 } = {},
) {
  const held = createNoteStack(capacity);
  const deferred = new Set<number>();
  const state = createArpState(held, deferred, 64, xorshift32(seed));
  for (const entry of pressed) {
    const [note, velocity] = Array.isArray(entry) ? entry : [entry, 100];
    arpStart(state, { note, velocity }, latch);
  }
  return { state, held, deferred };
}

/** One step at `t = index`, and the notes it started. */
function step(state: ArpState, config: ArpConfig, at: number): number[] {
  const events = arpStep(state, config, at, justBefore(at));
  return started(events);
}

const started = (events: ArpEvent[]) =>
  events.filter((e) => e.kind === "start").map((e) => e.note);

const stopped = (events: ArpEvent[]) =>
  events.filter((e) => e.kind === "stop").map((e) => e.note);

/** `count` steps, one per unit of time, and the note each one sounded. */
function play(state: ArpState, config: ArpConfig, count: number): number[] {
  const notes: number[] = [];
  for (let i = 0; i < count; i++) notes.push(...step(state, config, i + 1));
  return notes;
}

// Criterion 1. The KeyStep Pro manual's two sequences, which `@synthlet/arp`
// asserts over a scale and this asserts over four held keys. Same traversal,
// so the same index sequence: 1,2,3,4,3,2,1,2 and 1,2,3,4,4,3,2,1,1,2.
describe("the order", () => {
  const CHORD = [60, 62, 64, 65];

  it("walks up the held set and wraps", () => {
    const { state } = setup(CHORD);
    expect(play(state, ArpConfig("Up"), 6)).toEqual([60, 62, 64, 65, 60, 62]);
  });

  it("starts at the top for Down", () => {
    // The traversal seeds itself on the first read, which is what puts `Down`
    // at the top note rather than at the root.
    const { state } = setup(CHORD);
    expect(play(state, ArpConfig("Down"), 6)).toEqual([65, 64, 62, 60, 65, 64]);
  });

  it("reproduces the published UpDownExclusive sequence", () => {
    const { state } = setup(CHORD);
    expect(play(state, ArpConfig("UpDownExclusive"), 8)).toEqual([
      60, 62, 64, 65, 64, 62, 60, 62,
    ]);
  });

  it("reproduces the published UpDownInclusive sequence", () => {
    const { state } = setup(CHORD);
    expect(play(state, ArpConfig("UpDownInclusive"), 10)).toEqual([
      60, 62, 64, 65, 65, 64, 62, 60, 60, 62,
    ]);
  });

  it("never hangs on a single held note", () => {
    // The guard the two packages share `_traversal.ts` *for*. Without it this
    // is an unbounded loop, and a held-note arp meets a one-note set whenever
    // a player has one finger down - which is most of the time.
    for (const mode of [
      "Up",
      "Down",
      "UpDownExclusive",
      "UpDownInclusive",
      "Random",
      "RandomOther",
    ] as const) {
      const { state } = setup([60]);
      expect(play(state, ArpConfig(mode), 8)).toEqual(new Array(8).fill(60));
    }
  });
});

// Criterion 2, and D8's argument for splitting the order off the mode.
describe("the press order", () => {
  it("reads the set in the order the keys went down", () => {
    const { state } = setup([64, 60, 67]);
    expect(play(state, ArpConfig("Up", { order: "played" }), 4)).toEqual([
      64, 60, 67, 64,
    ]);
  });

  it("moves a re-pressed key to the end", () => {
    // `NoteStack.push` is a move, not a second entry, so a re-press is a
    // reordering of the same set. Nothing in the arp had to know that.
    const { state } = setup([64, 60, 67]);
    arpStart(state, { note: 60, velocity: 100 }, false);
    expect(play(state, ArpConfig("Up", { order: "played" }), 3)).toEqual([
      64, 67, 60,
    ]);
  });

  it("walks press order backwards under Down", () => {
    // The pairing an `AsPlayed` enum member could not express: as a member it
    // silently means press order *and* ascending. Two fields, four figures.
    const { state } = setup([64, 60, 67]);
    expect(play(state, ArpConfig("Down", { order: "played" }), 4)).toEqual([
      67, 60, 64, 67,
    ]);
  });

  it("leaves pitch order alone", () => {
    const { state } = setup([64, 60, 67]);
    expect(play(state, ArpConfig("Up"), 3)).toEqual([60, 64, 67]);
  });
});

// Criterion 3. A mode only a polyphonic output can have, which is the concrete
// reason the two packages' modes are not one shared enum.
describe("Chord", () => {
  it("sounds every held note on every step", () => {
    const { state } = setup([60, 64, 67]);
    const first = arpStep(state, ArpConfig("Chord"), 1, justBefore(1));
    expect(started(first)).toEqual([60, 64, 67]);

    const second = arpStep(state, ArpConfig("Chord"), 2, justBefore(2));
    // Every note of the chord is released and restated, so the envelopes
    // retrigger together: a chord stab, not one long note.
    expect(stopped(second)).toEqual([60, 64, 67]);
    expect(started(second)).toEqual([60, 64, 67]);
  });

  it("carries each note's own velocity", () => {
    const { state } = setup([
      [60, 40],
      [64, 120],
    ]);
    const events = arpStep(state, ArpConfig("Chord"), 1, justBefore(1));
    expect(
      events.filter((e) => e.kind === "start").map((e) => [e.note, e.velocity]),
    ).toEqual([
      [60, 40],
      [64, 120],
    ]);
  });

  it("leaves the traversal where it was", () => {
    // Which is what lets `"Chord"` be dropped in and out of a running pattern
    // without losing the position - and it is why `order`, `octaves` and
    // `octaveMode` are documented as ignored rather than silently applied.
    const { state } = setup([60, 62, 64, 65]);
    const up = ArpConfig("Up");
    expect(play(state, up, 2)).toEqual([60, 62]);
    arpStep(state, ArpConfig("Chord"), 3, justBefore(3));
    expect(play(state, up, 2)).toEqual([64, 65]);
  });
});

// Criterion 4. Free here, and one of the three the other arpeggiator deferred:
// `start()` carried a velocity all along.
describe("velocity", () => {
  it("travels with the entry", () => {
    const { state } = setup([
      [60, 40],
      [64, 120],
    ]);
    const first = arpStep(state, ArpConfig("Up"), 1, justBefore(1));
    const second = arpStep(state, ArpConfig("Up"), 2, justBefore(2));
    expect(first.find((e) => e.kind === "start")).toMatchObject({
      note: 60,
      velocity: 40,
    });
    expect(second.find((e) => e.kind === "start")).toMatchObject({
      note: 64,
      velocity: 120,
    });
  });

  it("follows a re-pressed key's new velocity", () => {
    const { state } = setup([[60, 40]]);
    arpStart(state, { note: 60, velocity: 110 }, false);
    expect(
      arpStep(state, ArpConfig("Up"), 1, justBefore(1)).find(
        (e) => e.kind === "start",
      ),
    ).toMatchObject({ note: 60, velocity: 110 });
  });
});

// Criterion 5's data half: a step releases before it starts, and one sample
// early. The automation half is in `index.test.ts`.
describe("a step's shape", () => {
  it("stops the previous note one sample before the next starts", () => {
    const { state } = setup([60, 64]);
    play(state, ArpConfig("Up"), 1);
    const events = arpStep(state, ArpConfig("Up"), 2, justBefore(2));
    expect(events).toEqual([
      { kind: "stop", note: 60, time: 2 - 1 / SAMPLE_RATE },
      { kind: "start", note: 64, velocity: 100, time: 2, duration: undefined },
    ]);
  });

  it("passes a duration through, which shortens the gate", () => {
    const { state } = setup([60]);
    const events = arpStep(state, ArpConfig("Up"), 1, justBefore(1), 0.1);
    expect(events[0]).toMatchObject({ kind: "start", duration: 0.1 });
  });

  it("emits its stops before its starts", () => {
    // So the instrument can apply the list in one pass: in mono, a stop whose
    // note the next event restarts is a silent stack removal.
    const { state } = setup([60, 64, 67]);
    play(state, ArpConfig("Chord"), 1);
    const events = arpStep(state, ArpConfig("Chord"), 2, justBefore(2));
    const kinds = events.map((e) => e.kind);
    expect(kinds.lastIndexOf("stop")).toBeLessThan(kinds.indexOf("start"));
  });
});

// Criteria 6 and 10: hold and latch are one mechanism, through one set.
describe("latch", () => {
  it("keeps playing after every key is released", () => {
    const { state, held } = setup([60, 64], { latch: true });
    arpStop(state, 60, true);
    arpStop(state, 64, true);
    expect(held.size).toBe(2);
    expect(play(state, ArpConfig("Up"), 3)).toEqual([60, 64, 60]);
  });

  it("replaces the chord when a new key arrives with nothing held", () => {
    // The Juno-60 manual's rule, and Arturia's: a new chord, not a layer.
    const { state, held } = setup([60, 64], { latch: true });
    arpStop(state, 60, true);
    arpStop(state, 64, true);
    arpStart(state, { note: 67, velocity: 100 }, true);
    expect(held.size).toBe(1);
    expect(play(state, ArpConfig("Up"), 2)).toEqual([67, 67]);
  });

  it("adds a key pressed while another is still down", () => {
    const { state, held } = setup([60], { latch: true });
    arpStart(state, { note: 64, velocity: 100 }, true);
    expect(held.size).toBe(2);
    expect(play(state, ArpConfig("Up"), 2)).toEqual([60, 64]);
  });

  it("clears the stale deferred releases when the chord is replaced", () => {
    // The old chord was being held *by* those releases. It is gone, so they
    // have nothing to apply to - and leaving them would release notes the
    // player never touched when the latch lifts.
    const { state, deferred } = setup([60, 64], { latch: true });
    arpStop(state, 60, true);
    arpStop(state, 64, true);
    expect(deferred.size).toBe(2);
    arpStart(state, { note: 67, velocity: 100 }, true);
    expect(deferred.size).toBe(0);
  });

  it("swallows one release into the deferred set and leaves the stack alone", () => {
    // Criterion 10, at this level: one boolean in, one entry out. The
    // instrument computes the boolean as `hold || latch`, which is what makes
    // the two impossible to disagree.
    const { state, held, deferred } = setup([60, 64]);
    arpStop(state, 60, true);
    expect([...deferred]).toEqual([60]);
    expect(held.size).toBe(2);
  });

  it("removes the note from the set when the release is not deferred", () => {
    const { state, held, deferred } = setup([60, 64]);
    arpStop(state, 60, false);
    expect(deferred.size).toBe(0);
    expect(held.size).toBe(1);
    expect(play(state, ArpConfig("Up"), 2)).toEqual([64, 64]);
  });

  it("voids a swallowed release when the key goes down again", () => {
    const { state, deferred } = setup([60]);
    arpStop(state, 60, true);
    expect(deferred.size).toBe(1);
    arpStart(state, { note: 60, velocity: 100 }, false);
    expect(deferred.size).toBe(0);
  });
});

// Criterion 7. Arturia's quantise-to-step behaviour, extended from "the set
// changed" to "the settings changed" - which is D11, and why `resize` and
// `setMode` are called at the step and never in a setter.
describe("a set that changes under the pattern", () => {
  it("keeps its index when a note is released", () => {
    const { state } = setup([60, 62, 64, 65, 67]);
    expect(play(state, ArpConfig("Up"), 2)).toEqual([60, 62]);
    // At index 2 of five. Release the root: index 2 of the four that are left.
    arpStop(state, 60, false);
    expect(play(state, ArpConfig("Up"), 1)).toEqual([65]);
  });

  it("keeps its index when a note is added", () => {
    const { state } = setup([60, 62, 64]);
    expect(play(state, ArpConfig("Up"), 2)).toEqual([60, 62]);
    // At index 2 of three; adding a note below moves what index 2 *names*.
    arpStart(state, { note: 59, velocity: 100 }, false);
    expect(play(state, ArpConfig("Up"), 1)).toEqual([62]);
  });

  it("re-clamps when the set shrinks past the index", () => {
    const { state } = setup([60, 62, 64, 65]);
    expect(play(state, ArpConfig("Up"), 3)).toEqual([60, 62, 64]);
    // At index 3. Two notes left, so the position clamps rather than reading
    // past the end - `euclid`'s NaN, which this is the same fix for.
    arpStop(state, 65, false);
    arpStop(state, 64, false);
    expect(play(state, ArpConfig("Up"), 2)).toEqual([62, 60]);
  });

  it("takes a new octave count at the next step, not in the setter", () => {
    const { state } = setup([60, 64]);
    const one = ArpConfig("Up");
    const two = ArpConfig("Up", { octaves: 2 });
    // Three steps over two notes leaves the position at index 1.
    expect(play(state, one, 3)).toEqual([60, 64, 60]);
    // A new config does not restart the pattern: the next step continues from
    // index 1 - so 64, not 60 - and only then walks into the second octave,
    // which is the range the assignment added. Nothing happened when the value
    // was constructed, and nothing happened when it was passed in; `resize`
    // runs at the step.
    expect(play(state, two, 3)).toEqual([64, 72, 76]);
  });

  it("survives every held note going away mid-pattern", () => {
    const { state } = setup([60, 62, 64]);
    play(state, ArpConfig("Up"), 2);
    for (const note of [60, 62, 64]) arpStop(state, note, false);
    expect(play(state, ArpConfig("Up"), 3)).toEqual([]);
  });
});

// Criterion 8. A press between two steps is inaudible: a step is what sounds.
describe("a press between two steps", () => {
  it("sounds nothing", () => {
    const { state } = setup([60]);
    expect(arpStart(state, { note: 64, velocity: 100 }, false)).toEqual([]);
  });

  it("sounds nothing even as the first press", () => {
    const { state } = setup();
    expect(arpStart(state, { note: 60, velocity: 100 }, false)).toEqual([]);
  });
});

// Criterion 12, under D5's amended wording: "a step with an empty stack writes
// nothing" reads as "no note is *started*". The first step after the set
// empties still writes the release, and every step after it writes nothing.
describe("a step with an empty set", () => {
  it("stops what is sounding and starts nothing", () => {
    const { state } = setup([60]);
    play(state, ArpConfig("Up"), 1);
    arpStop(state, 60, false);
    const first = arpStep(state, ArpConfig("Up"), 2, justBefore(2));
    expect(first).toEqual([
      { kind: "stop", note: 60, time: 2 - 1 / SAMPLE_RATE },
    ]);
  });

  it("writes nothing at all on every step after that", () => {
    const { state } = setup([60]);
    play(state, ArpConfig("Up"), 1);
    arpStop(state, 60, false);
    arpStep(state, ArpConfig("Up"), 2, justBefore(2));
    expect(arpStep(state, ArpConfig("Up"), 3, justBefore(3))).toEqual([]);
    expect(arpStep(state, ArpConfig("Up"), 4, justBefore(4))).toEqual([]);
  });

  it("writes nothing before anything has ever been held", () => {
    const { state } = setup();
    expect(arpStep(state, ArpConfig("Up"), 1, justBefore(1))).toEqual([]);
  });
});

// The octaves, which are the traversal's and therefore already proven in
// `@synthlet/arp` - these are the two mappings reaching the held set.
describe("the octaves", () => {
  it("stacks the set, serially", () => {
    const { state } = setup([60, 63, 67]);
    expect(
      play(state, ArpConfig("Up", { octaves: 3, octaveMode: "serial" }), 9),
    ).toEqual([60, 63, 67, 72, 75, 79, 84, 87, 91]);
  });

  it("leaps each note through the octaves, under repeat", () => {
    const { state } = setup([60, 63, 67]);
    expect(
      play(state, ArpConfig("Up", { octaves: 3, octaveMode: "repeat" }), 9),
    ).toEqual([60, 72, 84, 63, 75, 87, 67, 79, 91]);
  });

  it("is inert at one octave", () => {
    const { state } = setup([60, 63, 67]);
    expect(play(state, ArpConfig("Up", { octaves: 1 }), 3)).toEqual([
      60, 63, 67,
    ]);
  });

  it("folds rather than clamping above MIDI 127", () => {
    // Keeps the pitch class, which is the thing the set chose. Clamping to 127
    // would sound a note that is not in the chord at all.
    const { state } = setup([120]);
    expect(play(state, ArpConfig("Up", { octaves: 2 }), 2)).toEqual([120, 120]);
  });

  it("carries the entry's velocity into every octave", () => {
    const { state } = setup([[60, 40]]);
    const events = arpStep(
      state,
      ArpConfig("Up", { octaves: 2 }),
      1,
      justBefore(1),
    );
    expect(events[0]).toMatchObject({ note: 60, velocity: 40 });
  });
});

describe("the random modes", () => {
  const CHORD = [60, 62, 64, 65, 67];

  it("never repeats the note it just played, in Random", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { state } = setup(CHORD, { seed });
      const notes = play(state, ArpConfig("Random"), 24);
      expect(notes.some((n, i) => i > 0 && n === notes[i - 1])).toBe(false);
    }
  });

  it("covers the whole set once per pass, in RandomOther", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { state } = setup(CHORD, { seed });
      const notes = play(state, ArpConfig("RandomOther"), 10);
      expect([...notes.slice(0, 5)].sort((a, b) => a - b)).toEqual(CHORD);
      expect([...notes.slice(5)].sort((a, b) => a - b)).toEqual(CHORD);
    }
  });

  it("is exactly reproducible from a seed, in both modes", () => {
    for (const mode of ["Random", "RandomOther"] as const) {
      const a = setup(CHORD, { seed: 7 });
      const b = setup(CHORD, { seed: 7 });
      expect(play(a.state, ArpConfig(mode), 20)).toEqual(
        play(b.state, ArpConfig(mode), 20),
      );
    }
  });

  it("defaults to Math.random", () => {
    // The seam is a test seam: the shipped module has no user-facing seed, so
    // `createArpState` without one has to be `Math.random`.
    const held = createNoteStack(16);
    const state = createArpState(held, new Set());
    arpStart(state, { note: 60, velocity: 100 }, false);
    arpStart(state, { note: 64, velocity: 100 }, false);
    expect(
      play(state, ArpConfig("Random"), 8).every((n) => n === 60 || n === 64),
    ).toBe(true);
  });
});

describe("the transitions", () => {
  it("arpSilence stops what is sounding and nothing else", () => {
    const { state } = setup([60, 64]);
    play(state, ArpConfig("Chord"), 1);
    expect(arpSilence(state, 9)).toEqual([
      { kind: "stop", note: 60, time: 9 },
      { kind: "stop", note: 64, time: 9 },
    ]);
    // Idempotent: the arp is no longer sounding anything.
    expect(arpSilence(state, 9)).toEqual([]);
  });

  it("arpSoundHeld sounds the whole set with its own velocities", () => {
    // `synth.arp = null`: the chord the player is holding becomes a chord the
    // plain poly is sounding, which is what makes the switch inaudible-ish
    // rather than a silence.
    const { state } = setup([
      [60, 40],
      [64, 120],
    ]);
    expect(arpSoundHeld(state, 5)).toEqual([
      { kind: "start", note: 60, velocity: 40, time: 5 },
      { kind: "start", note: 64, velocity: 120, time: 5 },
    ]);
  });

  it("arpClear forgets the set, the keys and the position", () => {
    const { state, held } = setup([60, 62, 64]);
    play(state, ArpConfig("Up"), 2);
    arpClear(state);
    expect(held.size).toBe(0);
    expect(state.physicallyDown.size).toBe(0);
    expect(state.sounding).toEqual([]);
    // And the position: the next pattern starts at its own first note.
    arpStart(state, { note: 70, velocity: 100 }, false);
    arpStart(state, { note: 72, velocity: 100 }, false);
    expect(play(state, ArpConfig("Up"), 2)).toEqual([70, 72]);
  });

  it("arpClear leaves a reset pattern starting at the top under Down", () => {
    const { state } = setup([60, 62, 64]);
    play(state, ArpConfig("Down"), 2);
    arpClear(state);
    arpStart(state, { note: 70, velocity: 100 }, false);
    arpStart(state, { note: 72, velocity: 100 }, false);
    // Un-seeded, so `Down` seeds again at the top of the *new* set.
    expect(play(state, ArpConfig("Down"), 2)).toEqual([72, 70]);
  });
});

describe("the state it keeps", () => {
  it("shares the held stack with the instrument by reference", () => {
    // D1: the instrument maintains one held-note set at every voice count and
    // whether or not an arp is running, so switching the arp on mid-chord
    // finds the set already there. The arp reads that set, never a copy.
    const held = createNoteStack(16);
    const state = createArpState(held, new Set());
    arpStart(state, { note: 60, velocity: 100 }, false);
    expect(held.size).toBe(1);
    expect(state.held).toBe(held);
  });

  it("shares the deferred set with the instrument by reference", () => {
    const deferred = new Set<number>();
    const state = createArpState(createNoteStack(16), deferred);
    arpStart(state, { note: 60, velocity: 100 }, false);
    arpStop(state, 60, true);
    expect([...deferred]).toEqual([60]);
    expect(state.deferred).toBe(deferred);
  });

  it("evicts the least recently played note past capacity", () => {
    // The Juno-60 rule, and the stack's own: the arp inherits it for free.
    const { state, held } = setup([], { capacity: 3 });
    for (const note of [60, 62, 64, 65]) {
      arpStart(state, { note, velocity: 100 }, false);
    }
    expect(held.size).toBe(3);
    expect(play(state, ArpConfig("Up"), 3)).toEqual([62, 64, 65]);
  });
});
