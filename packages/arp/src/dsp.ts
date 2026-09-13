import { createGateDetector } from "./_gate";
import { getPitchClasses } from "./_scales";
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

// And the scales, for the same reason and by the same rule: the mask table and
// its decoder now live in `scripts/_scales.ts`, copied into this package and
// into `@synthlet/quantizer`, which snaps a signal to the notes this one walks.
// What had to be shared is that **2741 means the same set of notes in both** -
// a `scale` value, or a node patched into `scale`, can be moved from one to the
// other, which is what makes Part 16's Figure 15 a patch rather than a
// coincidence.
//
// The enum is `Scale` there and stays `ArpScale` here: this package named it
// first, and a shared file does not get to rename a published export. What did
// *not* move is everything below - the transposition to `baseNote`, the MIDI
// fold, the note-to-frequency memo - because those are this module's answers
// to this module's questions.
export { Scale as ArpScale, getPitchClasses } from "./_scales";

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
