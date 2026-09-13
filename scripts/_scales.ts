// DON'T EDIT THIS FILE unless inside scripts/_scales.ts
// use ./scripts/copy_files.sh to copy this file to the right place
// the goal is to avoid external dependencies on packages

// What a scale is, in this library: a 12-bit pitch-class mask.
//
//   Bit `i` set means pitch class `i` - i semitones above the root - belongs
//   to the scale. **Bit 0 is the root**, so the major scale [0,2,4,5,7,9,11]
//   is 0b101010110101 = 2741, and any number in 1..4095 is a valid (if
//   unusual) scale.
//
// The mask is relative to a root that lives somewhere else: `@synthlet/arp`
// calls it `baseNote` and builds a sequence upward from it, `@synthlet/quantizer`
// calls it `root` and snaps a note number to the nearest member. Nothing in
// this file knows about either.
//
// ## Why this is shared rather than written twice
//
// Not the nine lines of `getPitchClasses`. It is that **2741 has to mean the
// same set of notes in both modules**. The pair's whole point is that a mask
// can be moved - or patched, since `scale` is an `AudioParam` in both - from
// the arpeggiator to the quantiser: `Arp` walks the notes of a scale and
// `Quantizer` snaps a signal to them, and a patch that does both at once is
// Part 16's Figure 15. Two tables that drifted by one bit would put those two
// halves in different keys, with no error and nothing to say so - the same
// class of silence `_gate.ts` exists to prevent.
//
// It left `@synthlet/arp` the day the second consumer arrived, which is this
// repo's rule for a utility moving into `scripts/`, and the same event that
// moved `_traversal.ts` out of the same file when `@synthlet/instrument`
// arrived.
//
// ## What is deliberately not here
//
// The traversal (`_traversal.ts`), the transposition to a base note, the MIDI
// fold at 127, the note-to-frequency conversion, and every note *name*. Those
// are each one package's business: `arp` folds because its sequence can run
// past MIDI 127 and `quantizer` clamps because its input is declared 0..127,
// which are different answers to different questions. Dragging either in to
// make this file look substantial is how a shared file becomes a framework.

/**
 * Scales encoded as 12-bit pitch-class masks: bit `i` set means pitch class
 * `i` (semitones above the root) belongs to the scale. Bit 0 is the root, so
 * e.g. the major scale [0,2,4,5,7,9,11] is 0b101010110101 = 2741.
 *
 * Any number in 1..4095 is a valid (if unusual) scale.
 *
 * Exported as `ArpScale` by `@synthlet/arp`, which named it first, and as
 * `Scale` by every package that adopts it afterwards. The two are the same
 * members - `worklet-copies.test.ts` asserts this file is byte-identical
 * across its copies - under two names, because a package's public spelling is
 * not something a shared file gets to change retroactively.
 */
export enum Scale {
  Augmented = 2457,
  Blues = 1257,
  Chromatic = 4095,
  Dominant7th = 1169,
  Dorian = 1709,
  HalfWholeDiminished = 1755,
  HarmonicMinor = 2477,
  Locrian = 1387,
  Lydian = 2773,
  Major6th = 657,
  Major7th = 2193,
  Major = 2741,
  MelodicMinor = 2733,
  Minor7th = 1161,
  Minor = 1453,
  MinorMajor7th = 2185,
  Mixolydian = 1717,
  PentatonicMajor = 661,
  PentatonicMinor = 1193,
  Phrygian = 1451,
  Sus2 = 133,
  Sus4 = 161,
  TriadAugmented = 273,
  TriadDiminished = 73,
  TriadMajor = 145,
  TriadMinor = 137,
  WholeHalfDiminished = 2925,
  WholeTone = 1365,
}

/**
 * Decode a scale bitmask into its pitch classes (bit 0 = root).
 * An empty mask yields the root alone.
 */
export function getPitchClasses(scale: number): number[] {
  const pitchClasses: number[] = [];
  for (let i = 0; i < 12; i++) {
    if (scale & (1 << i)) {
      pitchClasses.push(i);
    }
  }
  return pitchClasses.length ? pitchClasses : [0];
}
