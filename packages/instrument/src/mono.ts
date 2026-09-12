// `voices: 1` is a different algorithm wearing the same API.
//
// A pool of one is not a monosynth. Play two keys and the second steals the
// first - always, whatever the pitch or the order - and releasing the second
// leaves silence, because a pool has no memory of what else is held. A
// monosynth remembers: the note stack keeps every key that is down, a
// *priority* says which of them sounds, and releasing the top key returns to
// the one underneath.
//
// Synth Secrets Part 18 (Gordon Reid, Sound On Sound, October 2000) sets it
// out as two independent axes, and this file is both of them:
//
//   priority   which held note sounds: last, low, high, first
//   triggering whether a note change restarts the envelopes (multi, the ARP
//              way) or leaves them running (single, the Minimoog way)
//
// On the gate contract the second axis is one decision - does the gate dip to
// zero between two notes, or stay high - which is why it is one boolean here
// rather than the six trigger regimes the article counts. Reset-to-zero and
// retrigger-on-release are envelope behaviours; they belong to `adsr`, not to
// the thing driving it.
//
// Nothing here knows about Web Audio. These functions answer "what should be
// written, and when", and the instrument turns the answer into automation:
// a MIDI note into Hz, a velocity into a gain, `justBefore` into one sample.
// That is what makes the article's tables assertable as data.

import { NotePriority, NoteStack, createNoteStack } from "./_voices";

/** One thing to write into the single voice. */
export type MonoWrite =
  /**
   * Pitch, as a MIDI note number. `glide` means a note was already sounding,
   * so the instrument may ramp from it if its `glide` time is non-zero;
   * without it there is nothing to ramp from and the write is a step.
   */
  | { param: "frequency"; note: number; time: number; glide: boolean }
  /** 0-127. The instrument writes it as a gain, and as 0-1 if the voice asks. */
  | { param: "velocity"; velocity: number; time: number }
  /**
   * The gate, 0 or 1. `justBefore` asks for one sample earlier than `time`:
   * the retrigger dip. One sample is enough because the gate contract fires on
   * any non-positive-to-positive transition and both envelopes read the gate
   * a-rate, so a single sample at zero is a genuine edge rather than a value
   * that might be sampled over.
   */
  | { param: "gate"; value: number; time: number; justBefore?: boolean };

export type MonoState = {
  /** Every key that is down, in press order and in pitch order. */
  stack: NoteStack;
  /** The note the voice is sounding, or -1 when the gate is closed. */
  sounding: number;
};

export type MonoOptions = {
  priority: NotePriority;
  /** `false` retriggers on every note change; `true` leaves the gate high. */
  legato: boolean;
};

export function createMonoState(capacity = 16): MonoState {
  return { stack: createNoteStack(capacity), sounding: -1 };
}

/** The pitch, level and gate writes for a note that speaks at `time`. */
function articulate(
  state: MonoState,
  options: MonoOptions,
  note: number,
  velocity: number,
  time: number,
): MonoWrite[] {
  const open = state.sounding !== -1;
  const writes: MonoWrite[] = [];

  // Single triggering leaves the envelopes running: the gate is only touched
  // when there is nothing sounding to run on.
  if (open && !options.legato) {
    writes.push({ param: "gate", value: 0, time, justBefore: true });
  }
  // Pitch and level before the gate, so both are in place when it rises.
  writes.push({ param: "frequency", note, time, glide: open });
  writes.push({ param: "velocity", velocity, time });
  if (!open || !options.legato) {
    writes.push({ param: "gate", value: 1, time });
  }

  state.sounding = note;
  return writes;
}

/**
 * A key goes down.
 *
 * The pressed note only speaks if the priority picks it: press a high note on
 * a lowest-note-priority synth while a low one is held and nothing happens at
 * all, which is Figure 2(a) of the article and the reason the four priorities
 * are not reducible to each other.
 */
export function monoStart(
  state: MonoState,
  options: MonoOptions,
  event: { note: number; velocity: number; time: number },
): MonoWrite[] {
  state.stack.push(event.note, event.velocity);
  const top = state.stack.top(options.priority)!;

  // Unchanged, and not the key just pressed: this press is inaudible.
  if (top.note !== event.note && top.note === state.sounding) return [];

  return articulate(state, options, top.note, top.velocity, event.time);
}

/**
 * A key comes up.
 *
 * If it was not the sounding note, nothing happens. If it was and others are
 * still held, the note the priority now picks takes over - with *its own*
 * velocity, so a quiet low note stays quiet when the loud high note above it
 * is released. If it was the last one, the gate closes.
 */
export function monoStop(
  state: MonoState,
  options: MonoOptions,
  event: { note: number; time: number },
): MonoWrite[] {
  state.stack.remove(event.note);
  const top = state.stack.top(options.priority);

  if (!top) {
    if (state.sounding === -1) return [];
    state.sounding = -1;
    return [{ param: "gate", value: 0, time: event.time }];
  }
  if (top.note === state.sounding) return [];

  // The note underneath returns. Always glided when there is a glide time:
  // there is by definition something sounding to glide from.
  return articulate(state, options, top.note, top.velocity, event.time);
}

/** Every key up at once, sounding or merely scheduled. A panic is a panic. */
export function monoStopAll(state: MonoState, time: number): MonoWrite[] {
  state.stack.clear();
  if (state.sounding === -1) return [];
  state.sounding = -1;
  return [{ param: "gate", value: 0, time }];
}
