import { createGateDetector } from "./_gate";
import {
  ArpMode,
  ArpOctaveMode,
  createTraversal,
  type Traversal,
} from "./_traversal";

// The traversal - the two mode enums and the index math - lives in
// `scripts/_traversal.ts` and is copied into this package and into
// `@synthlet/instrument`, which walks the same modes over a stack of *held*
// notes. It moved out of this file when the second consumer arrived; the
// header of `createArpeggiator` below said it would.
export { ArpMode, ArpOctaveMode } from "./_traversal";
export type { Traversal, TraversalPosition } from "./_traversal";

/**
 * Scales encoded as 12-bit pitch-class masks: bit `i` set means pitch class
 * `i` (semitones above the root) belongs to the scale. Bit 0 is the root, so
 * e.g. the major scale [0,2,4,5,7,9,11] is 0b101010110101 = 2741.
 *
 * Any number in 1..4095 is a valid (if unusual) scale.
 */
export enum ArpScale {
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
 * The engine: one note per rising edge of `trigger`, held on the output as a
 * frequency in Hz until the next one.
 *
 * **It stores a position, not a note.** The traversal holds one integer
 * walking the `len * octaves` sequence, and `readNote()` turns it into a MIDI
 * note when the note is read. Three things follow, and all three are the
 * reason for the shape: `baseNote` becomes a live transposition inlet rather
 * than something that only applies to the next pick; the value held before the
 * first trigger is the note about to be played, with no special case; and the
 * traversal refers to nothing but a flat index and its length, which is what
 * let it lift out of this file unchanged into `scripts/_traversal.ts` when the
 * polyphonic voice module wanted the same modes over a stack of held notes.
 *
 * What is left here is everything that is about *notes* rather than about
 * positions: the scale mask, the transposition, the MIDI fold, the gate
 * detector and the note-to-frequency memoisation.
 *
 * @param random the source of randomness. It is an argument so the tests can
 *   assert a *sequence* rather than a distribution - without it every
 *   assertion in this package has to be hedged around `Math.random`. There is
 *   deliberately no user-facing `seed` parameter: this is a test seam, and an
 *   `AudioParam` carrying an integer nobody can interpret would be the only
 *   parameter in the library with no musical meaning. `worklet.ts` never
 *   passes an argument, so the shipped module is unchanged.
 */
export function createArpeggiator(random: () => number = Math.random) {
  let $note = 60;
  let $scale = 0;
  // 0 rather than 1, so the first call always takes the rebuild branch below.
  let $octaves = 0;
  let $mode: ArpMode = ArpMode.Up;
  let $octaveMode: ArpOctaveMode = ArpOctaveMode.Serial;

  let scaleNotes = [0];
  let len = 1;

  /**
   * Where in the sequence we are. Sized at the largest sequence the parameters
   * can declare - twelve pitch classes over ten octaves - so its shuffle bag
   * refills in place and nothing allocates on a trigger.
   */
  const traversal: Traversal = createTraversal(120, random);

  const detectGate = createGateDetector();
  // Resolved on the first call to the note the sequence is sitting on. It used
  // to be seeded with `$note`, which is the literal 60 at construction time
  // whatever `baseNote` turns out to be - so `Arp(ac, { baseNote: 48 })` held
  // 261.63 Hz, neither the root nor a member of the set, until its first
  // trigger.
  let current = NaN;

  // The note-to-frequency conversion is memoised on the MIDI note because
  // `trigger` is a-rate: the worklet calls this once per sample, and the note
  // changes at most once per block. Without the cache that is 128 `Math.pow`
  // calls a block for one result.
  let $current = NaN;
  let $frequency = 0;

  return function update(
    trigger: number,
    baseNote: number,
    scale: number,
    octaves: number,
    // Optional so the whole of this file's contract is still four arguments
    // and a traversal; `worklet.ts` always passes both.
    mode: ArpMode = ArpMode.Up,
    octaveMode: ArpOctaveMode = ArpOctaveMode.Serial,
  ): number {
    $note = baseNote;
    // Structural, but it does not change the size of the sequence - it only
    // changes which pair a position names - so it is read here rather than in
    // the rebuild branch, and it cannot invalidate the shuffle bag. The local
    // copy exists only to keep this off the traversal on every sample: the
    // mapping itself lives there now.
    if ($octaveMode !== octaveMode) {
      $octaveMode = octaveMode;
      traversal.setOctaveMode(octaveMode);
    }
    // A count, and floored once per call rather than per use: an `AudioParam`
    // hands over a fractional value from any ramp or from any node patched
    // into it, and `octaves: 2.5` used to span three. `Math.max` because the
    // parameter's `minValue` is enforced by the graph, not by this function,
    // which the tests call directly.
    const octaveCount = Math.max(1, Math.floor(octaves));

    if ($scale !== scale || $octaves !== octaveCount) {
      $scale = scale;
      $octaves = octaveCount;
      scaleNotes = getPitchClasses(scale);
      len = scaleNotes.length;
      // Which invalidates the shuffle bag and clamps the position, both of
      // which belong to the position rather than to the scale.
      traversal.resize(len, octaveCount);
    }

    if ($mode !== mode) {
      $mode = mode;
      traversal.setMode(mode);
    }

    // Emit, then advance: the first trigger sounds the note the sequence is
    // already sitting on, which for `Up` is the root. rune06's Juno
    // arpeggiator asserts the same thing of its own first note. The traversal
    // seeds itself on that first read, which is why `Down` starts at the top
    // without this function knowing that it does.
    if (detectGate(trigger) === true) {
      current = readNote();
      traversal.advance();
    } else if (Number.isNaN(current)) {
      current = readNote();
    }

    if (current !== $current) {
      $current = current;
      $frequency = 440 * Math.pow(2, (current - 69) / 12);
    }

    return $frequency;
  };

  /** The position, read as a note. */
  function readNote() {
    const { noteIndex, octaveIndex } = traversal.read();
    let note = $note + scaleNotes[noteIndex] + octaveIndex * 12;
    // Fold, don't clamp. `baseNote` and `octaves` are declared 0...127 and
    // 1...10, and at both maxima this sum reaches MIDI 246 - 12.1 MHz - which
    // no consumer can play: `polyblep-oscillator` caps `frequency` at 20000
    // and a native `OscillatorNode` clamps to Nyquist, so every note past the
    // top collapses onto one pitch and the arpeggiator silently stops moving.
    //
    // Folding is the only option that keeps the pitch class, which is the
    // thing the set actually chose: clamping to 127 gives a note outside the
    // set, and skipping the note would change the pattern's length. Yarns
    // folds exactly this way and rune06 folds at 96, modelling the Juno's
    // keyboard.
    while (note > 127) note -= 12;
    return note;
  }
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
