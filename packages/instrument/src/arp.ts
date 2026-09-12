// An arpeggiator over the notes a player is holding.
//
// The other kind of arpeggiator - `@synthlet/arp` - arpeggiates a chord you
// *declare*, as a scale mask and a root, and self-plays in the graph off a
// clock. This one arpeggiates a chord you *hold*, and is driven from outside
// by `arpStep(time)`. Three features that one had to defer are free here, and
// all three for the same reason: the instrument is the allocator, so it has a
// polyphonic output and a set of notes with a press order.
//
//   velocity    `start()` carried one all along, and it travels with the note
//   "Chord"     a polyphonic output can sound the whole set on every step
//   order       only a *held* set has an order other than pitch
//
// Nothing here knows about Web Audio. These functions answer "what should
// sound, and when", and the instrument turns the answer into automation -
// which is what makes a whole arpeggio assertable as data. Same shape as
// `mono.ts`, and for the same reason.
//
// ## The state
//
// The ticket says this adds no new state, which is true of `voices: 1` and
// false of the pool: `mono.ts`'s note stack only exists when `voices === 1`,
// so at `voices: 8` there was no held-note set at all. The instrument now
// keeps one at every voice count and whether or not an arp is running - which
// is what lets the arp be switched on mid-chord and find the set already
// there, and switched off and hand the set back.
//
// Deliberately **not** mono's own stack. In arp mode that one holds exactly
// the note the arp is sounding - at most one - so `top(priority)` is always
// the new note whatever the priority says. Sharing them would make
// `priority: "low"` pick the lowest of the notes the arp had accumulated.
//
// ## Hold and latch are one mechanism
//
// rune06 routes both through deferred note-offs (`synth.rs:224-250`); so does
// Mutable. `deferred` is shared *by reference* with the instrument's sustain
// pedal, so the two cannot disagree: `arpStop` takes one boolean, which the
// instrument computes as `hold || latch`.
//
// Latch's one extra rule: a note-on while latched *and nothing physically
// held* clears the set first - a new chord, rather than layering onto the old
// one. That is the Juno-60 manual's behaviour and Arturia's, and it is why
// `physicallyDown` is tracked separately from the held set.

import { ArpConfig } from "./arp-config";
import { createTraversal, Traversal } from "./_traversal";
import { NoteStack } from "./_voices";
import { resolveArpMode, resolveArpOctaveMode } from "./names";

/**
 * One thing for the instrument to do. A step emits its stops before its
 * starts, so one pass over the list in order is enough.
 */
export type ArpEvent =
  | {
      kind: "start";
      note: number;
      /** 0-127, the velocity the key was pressed with. */
      velocity: number;
      time: number;
      /** Seconds. Shortens the gate; without it the note lasts the step. */
      duration?: number;
    }
  | { kind: "stop"; note: number; time: number };

export type ArpState = {
  /** Every key down, plus every key latch or the pedal is holding. */
  held: NoteStack;
  /**
   * The keys with no note-off received yet. What separates "a new chord" from
   * "another note in this one" while latched.
   */
  physicallyDown: Set<number>;
  /** Note-offs swallowed by `hold || latch`. Shared with the instrument. */
  deferred: Set<number>;
  /** Where in the set the pattern is. Survives the set changing under it. */
  traversal: Traversal;
  /** The notes the arp is sounding. An array because `"Chord"` sounds the set. */
  sounding: number[];
};

/**
 * @param held the instrument's held-note stack, by reference: the arp reads
 *   the set the instrument already maintains rather than a copy of it.
 * @param deferred the instrument's swallowed note-offs, by reference, so the
 *   sustain pedal and the latch cannot hold different sets.
 * @param capacity the largest sequence the arp can present - the stack's
 *   capacity times the octave maximum - which sizes the shuffle bag once.
 */
export function createArpState(
  held: NoteStack,
  deferred: Set<number>,
  capacity = 64,
  random: () => number = Math.random,
): ArpState {
  return {
    held,
    physicallyDown: new Set(),
    deferred,
    traversal: createTraversal(capacity, random),
    sounding: [],
  };
}

/**
 * A key goes down.
 *
 * Returns nothing to sound: while an arp is running a step is what sounds, and
 * a press only changes the set the next step will read. That is criterion 8,
 * and it is Arturia's quantise-to-step behaviour.
 */
export function arpStart(
  state: ArpState,
  event: { note: number; velocity: number },
  latch: boolean,
): ArpEvent[] {
  // A new chord replaces the latched one; another finger on top adds to it.
  // Read before the press is recorded, or every press looks like a new chord.
  const fresh = latch && state.physicallyDown.size === 0;
  state.physicallyDown.add(event.note);
  // The key is down again, so a swallowed release for it is void.
  state.deferred.delete(event.note);
  if (fresh) {
    state.held.clear();
    // The old chord's releases were swallowed into `deferred` and are what
    // was holding it. It is gone, so they have nothing left to apply to.
    state.deferred.clear();
  }
  state.held.push(event.note, event.velocity);
  return [];
}

/**
 * A key comes up.
 *
 * `defer` is the instrument's `hold || latch` - one boolean, so the pedal and
 * the latch cannot disagree about a release. Deferred, the note stays in the
 * set and the arp keeps playing it; applied, it leaves the set and the arp
 * stops reaching it at the next step.
 */
export function arpStop(
  state: ArpState,
  note: number,
  defer: boolean,
): ArpEvent[] {
  state.physicallyDown.delete(note);
  if (defer) {
    state.deferred.add(note);
    return [];
  }
  state.held.remove(note);
  // Nothing stops here: the note the arp is sounding runs until the next step
  // releases it, which is what "stops at the next step" means.
  return [];
}

/**
 * One step.
 *
 * @param time when the next note speaks.
 * @param releaseAt when the sounding note stops - one sample before `time`, so
 *   the audio thread actually observes the gate fall and the envelope
 *   retriggers. Two `setValueAtTime` calls at one instant are not an edge.
 * @param duration shortens the gate; without it a note lasts until the next
 *   step releases it.
 */
export function arpStep(
  state: ArpState,
  config: ArpConfig,
  time: number,
  releaseAt: number,
  duration?: number,
): ArpEvent[] {
  const events: ArpEvent[] = [];

  // Release first, always: a step with an empty set stops what is sounding and
  // starts nothing, and every step after that writes nothing at all.
  for (const note of state.sounding) {
    events.push({ kind: "stop", note, time: releaseAt });
  }
  state.sounding.length = 0;

  if (state.held.size === 0) return events;

  if (config.mode === "Chord") {
    // The whole set, each note with its own velocity, and the traversal
    // untouched: there is no position to read, so `order`, `octaves` and
    // `octaveMode` say nothing. Leaving the position alone is also what lets
    // `"Chord"` be switched in and out of without losing the pattern.
    for (let i = 0; i < state.held.size; i++) {
      const entry = state.held.sorted(i);
      events.push({
        kind: "start",
        note: entry.note,
        velocity: entry.velocity,
        time,
        duration,
      });
      state.sounding.push(entry.note);
    }
    return events;
  }

  // The shape of the set *and* of the pattern, re-read here and never in a
  // setter: a key pressed or released between two steps, and a config
  // assigned between two steps, both take effect on the beat. `resize` is a
  // no-op when neither has changed, so this costs two comparisons.
  state.traversal.resize(state.held.size, config.octaves);
  state.traversal.setMode(resolveArpMode(config.mode));
  state.traversal.setOctaveMode(resolveArpOctaveMode(config.octaveMode));

  const { noteIndex, octaveIndex } = state.traversal.read();
  // One accessor swap, which is the whole of `order` - Yarns does exactly this
  // (`part.cc:419-422`). It is orthogonal to the direction: press order
  // downward is as meaningful as press order upward.
  const entry =
    config.order === "played"
      ? state.held.played(noteIndex)
      : state.held.sorted(noteIndex);

  let note = entry.note + octaveIndex * 12;
  // Fold, don't clamp, exactly as `@synthlet/arp` does: folding keeps the
  // pitch class, which is the thing the set actually chose.
  while (note > 127) note -= 12;

  events.push({
    kind: "start",
    note,
    velocity: entry.velocity,
    time,
    duration,
  });
  state.sounding.push(note);
  // Emit, then advance: a step sounds the position it is sitting on, so the
  // first step after a reset is the mode's own first note.
  state.traversal.advance();
  return events;
}

/** Stop whatever the arp is sounding, and nothing else. */
export function arpSilence(state: ArpState, time: number): ArpEvent[] {
  const events: ArpEvent[] = state.sounding.map((note) => ({
    kind: "stop" as const,
    note,
    time,
  }));
  state.sounding.length = 0;
  return events;
}

/**
 * The held set, sounded through the normal path - what `synth.arp = null`
 * does. Each note with its own velocity, so the chord comes back as it was
 * played rather than flattened to one level.
 */
export function arpSoundHeld(state: ArpState, time: number): ArpEvent[] {
  const events: ArpEvent[] = [];
  for (let i = 0; i < state.held.size; i++) {
    const entry = state.held.sorted(i);
    events.push({
      kind: "start",
      note: entry.note,
      velocity: entry.velocity,
      time,
    });
  }
  return events;
}

/** Forget everything: the set, the keys, the position. `stop()` with no note. */
export function arpClear(state: ArpState): void {
  state.held.clear();
  state.physicallyDown.clear();
  state.sounding.length = 0;
  state.traversal.reset();
}
