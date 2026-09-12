// Strings in the user zone, numbers in the DSP zone, and this file is the
// boundary.
//
// The rule: main-thread code that a *person* writes takes strings and prefers
// no ceremony; code that is - or is written to become - the inside of a
// worklet takes numbers.
//
//   user   { priority: "low" }, ArpConfig("UpDownExclusive"), a preset's JSON
//   DSP    NotePriority.Low, StealMode.Protect, ArpMode.UpDownExclusive
//
// Both spellings therefore exist in this one package, deliberately and along
// this seam rather than by accident:
//
// - `_voices.ts` says in its own header that it is "written to be copied into
//   a worklet one day", so `NotePriority` and `StealMode` stay numeric inside
//   it - and `createVoiceAllocator`/`createNoteStack` are deliberately public,
//   so the enums stay exported too.
// - `_traversal.ts` is the same file `@synthlet/arp` runs on the audio thread,
//   where `ArpMode` is an `AudioParam` carrying a number, so its enum is
//   numeric as well.
// - `Instrument()`'s options and `ArpConfig` are the user zone, so they take
//   names, and `resolveName` is where a name becomes a member.
//
// Two consequences worth stating plainly. **Presets become self-describing**:
// `priority: "low"` in saved JSON rather than `priority: 1`, in a format whose
// whole purpose is to be stored, read and shared. And **a bad name now throws
// naming itself**, where before `priority` had no runtime validation at all
// because TypeScript was doing the work - which is no help to a preset loaded
// from a file.

import { ArpMode, ArpOctaveMode } from "./_traversal";
import { NotePriority, StealMode } from "./_voices";

/** Which held note a monophonic instrument sounds. `voices: 1` only. */
export type NotePriorityName = "last" | "low" | "high" | "first";

/** What to do when every voice is busy and another note arrives. */
export type StealModeName = "protect" | "lru" | "mru" | "drop";

/** How a position in the sequence becomes a note and an octave. */
export type ArpOctaveModeName = "serial" | "repeat";

/**
 * How the held set is traversed.
 *
 * The six `@synthlet/arp` has, plus one that only a polyphonic output can
 * have: a worklet with a single frequency output cannot sound a chord, so
 * `"Chord"` is not a mode it could accept. This is why the two packages'
 * modes are *not* one shared enum - see `arp-config.ts`.
 */
export type ArpModeName =
  | "Up"
  | "Down"
  | "UpDownExclusive"
  | "UpDownInclusive"
  | "Random"
  | "RandomOther"
  /**
   * Every held note on every step. Ignores `order`, `octaves` and
   * `octaveMode`: there is no position to read, so there is nothing for them
   * to say.
   */
  | "Chord";

/**
 * Which order the held set is read in.
 *
 * Orthogonal to the mode, which is a *direction*: press order downward is as
 * meaningful a figure as press order upward, and an enum member called
 * `AsPlayed` can only mean one of them. Yarns keeps them separate for the same
 * reason - the order is one accessor swap over the same traversal
 * (`part.cc:419-422`).
 */
export type ArpOrder = "pitch" | "played";

const NOTE_PRIORITIES: Record<NotePriorityName, NotePriority> = {
  last: NotePriority.Last,
  low: NotePriority.Low,
  high: NotePriority.High,
  first: NotePriority.First,
};

const STEAL_MODES: Record<StealModeName, StealMode> = {
  protect: StealMode.Protect,
  lru: StealMode.Lru,
  mru: StealMode.Mru,
  drop: StealMode.Drop,
};

/** No `"Chord"`: it never reaches the traversal, because it reads no position. */
const ARP_MODES: Record<Exclude<ArpModeName, "Chord">, ArpMode> = {
  Up: ArpMode.Up,
  Down: ArpMode.Down,
  UpDownExclusive: ArpMode.UpDownExclusive,
  UpDownInclusive: ArpMode.UpDownInclusive,
  Random: ArpMode.Random,
  RandomOther: ArpMode.RandomOther,
};

const ARP_OCTAVE_MODES: Record<ArpOctaveModeName, ArpOctaveMode> = {
  serial: ArpOctaveMode.Serial,
  repeat: ArpOctaveMode.Repeat,
};

/**
 * A name into its enum member.
 *
 * Throws naming the value and listing the known ones, which is `presets.ts`'s
 * rule for an unknown parameter key and for the same reason: the names are the
 * schema, and a typo in a stored sound has to say what it was.
 */
export function resolveName<T>(
  table: Record<string, T>,
  name: string,
  what: string,
): T {
  const value = table[name];
  if (value === undefined) {
    throw Error(
      `Unknown ${what} "${name}"; known: ${Object.keys(table).join(", ")}`,
    );
  }
  return value;
}

export const resolvePriority = (name: NotePriorityName): NotePriority =>
  resolveName(NOTE_PRIORITIES, name, "note priority");

export const resolveStealMode = (name: StealModeName): StealMode =>
  resolveName(STEAL_MODES, name, "steal mode");

export const resolveArpMode = (name: Exclude<ArpModeName, "Chord">): ArpMode =>
  resolveName(ARP_MODES, name, "arp mode");

export const resolveArpOctaveMode = (name: ArpOctaveModeName): ArpOctaveMode =>
  resolveName(ARP_OCTAVE_MODES, name, "arp octave mode");

/** The four, in the order an error message lists them. */
export const PRIORITY_NAMES = Object.keys(
  NOTE_PRIORITIES,
) as NotePriorityName[];
export const STEAL_NAMES = Object.keys(STEAL_MODES) as StealModeName[];
/** The seven, `"Chord"` last: it is the one that reads no position. */
export const ARP_MODE_NAMES = [
  ...(Object.keys(ARP_MODES) as Exclude<ArpModeName, "Chord">[]),
  "Chord" as const,
];
export const ARP_OCTAVE_MODE_NAMES = Object.keys(
  ARP_OCTAVE_MODES,
) as ArpOctaveModeName[];

/** Whether a name is one of the seven. The `"Chord"` case `ARP_MODES` omits. */
export const isArpModeName = (name: string): name is ArpModeName =>
  name === "Chord" || name in ARP_MODES;

/**
 * Back the other way, for `getPreset`: a stored sound holds names, so the
 * member the allocator is actually using has to be spelled before it is saved.
 * The only reverse direction anything needs - `steal` is fixed at
 * construction and the arp keeps its config as a value already.
 */
export function priorityName(priority: NotePriority): NotePriorityName {
  const found = PRIORITY_NAMES.find(
    (name) => NOTE_PRIORITIES[name] === priority,
  );
  if (found === undefined) {
    throw Error(
      `No name for note priority ${priority}; known: ` +
        `${PRIORITY_NAMES.join(", ")}`,
    );
  }
  return found;
}
