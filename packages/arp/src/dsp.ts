import { createGateDetector } from "./_gate";

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
 * How the sequence is traversed. An index into a bank of traversal functions,
 * not a quantity - see `params.ts` for why it is k-rate.
 *
 * Both `UpDown` variants are spelled out rather than merged behind an
 * `inclusive` flag because Arturia, u-he and PolyBrute all ship the two as
 * separate menu entries, and a bare `UpDown` makes the user guess which one
 * they got. The index sequences in the comments are the KeyStep Pro manual's,
 * over a four-note set, and `dsp.test.ts` asserts them verbatim.
 */
export enum ArpMode {
  /** 1,2,3,4 · 1,2,3,4 … */
  Up = 0,
  /** 4,3,2,1 · 4,3,2,1 … */
  Down = 1,
  /** 1,2,3,4,3,2,1 · 2,3,4,3,2,1 …  the turnaround notes play once */
  UpDownExclusive = 2,
  /** 1,2,3,4,4,3,2,1 · 1,2,3,4,4,3,2,1 …  the turnaround notes play twice */
  UpDownInclusive = 3,
  /**
   * Uniform over the set, but never the note just played. It wanders, and it
   * can dwell on a region of the set - which is what people reach for when
   * they want an arpeggiator to sound unpredictable.
   */
  Random = 4,
  /**
   * Every note of the set once per pass, in a fresh order each pass. It
   * covers: a pass is always a complete statement of the chord, which is much
   * closer to "an arpeggio" and much less likely to sound aimless over a long
   * pattern. Ableton ships both for this reason.
   */
  RandomOther = 5,
}

/**
 * How a position in the sequence becomes a note and an octave. Two mappings
 * over the same `len * octaves` rectangle, and they are transposes of each
 * other - which is why both visit every (note, octave) pair exactly once per
 * cycle, and why the traversal does not know this parameter exists.
 *
 * A minor triad over three octaves, `Up`:
 *
 * ```
 * Serial   60 63 67 · 72 75 79 · 84 87 91
 * Repeat   60 72 84 · 63 75 87 · 67 79 91
 * ```
 *
 * The second is a completely different figure - octave leaps on each chord
 * tone rather than three stacked arpeggios - from an identical chord and an
 * identical direction. u-he's Hive is the only surveyed product that separates
 * the two; everything else, Mutable included, hardcodes `Serial`.
 */
export enum ArpOctaveMode {
  /** The whole set, then up an octave and the whole set again. Note-fast. */
  Serial = 0,
  /** Each note in every octave, then the next note. Octave-fast. */
  Repeat = 1,
}

/**
 * The engine: one note per rising edge of `trigger`, held on the output as a
 * frequency in Hz until the next one.
 *
 * **It stores a position, not a note.** `flat` is one integer walking the
 * `len * octaves` sequence, and `readNote()` turns it into a MIDI note when the
 * note is read. Three things follow, and all three are the reason for the
 * shape: `baseNote` becomes a live transposition inlet rather than something
 * that only applies to the next pick; the value held before the first trigger
 * is the note about to be played, with no special case; and the traversal
 * refers to nothing but a flat index and its length, so it lifts out of this
 * file unchanged the day the polyphonic voice module wants the same modes over
 * a stack of held notes.
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
  /** How many entries the sequence has: every note, in every octave. */
  let size = 1;

  /** Where in that sequence we are, and which way we are going. */
  let flat = 0;
  let direction = 1;
  let seeded = false;

  /**
   * `RandomOther`'s shuffle bag, preallocated at the largest sequence the
   * parameters can declare - twelve pitch classes over ten octaves - so a
   * refill writes in place and nothing allocates on a trigger.
   */
  const bag = new Int32Array(120);
  /** How far the bag has been drained. `>= size` means "refill before drawing". */
  let bagIndex = 0;

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
    // Structural, but it does not change `size` - it only changes which pair a
    // position names - so it is read here rather than in the rebuild branch,
    // and it cannot invalidate the shuffle bag.
    $octaveMode = octaveMode;
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
      size = len * octaveCount;
      // The bag is a permutation of the old sequence, so a set change
      // invalidates it. Marked drained here, next to the index clamp, rather
      // than rebuilt eagerly: the refill costs a shuffle and this branch can
      // fire on a mode nobody is using.
      bagIndex = size;
      // Clamp *here*, where `size` is recomputed, and not on the next gate
      // edge. `euclid` has a measured `NaN` from doing it the other way round:
      // it rebuilds its pattern when `steps` changes but only wraps its cursor
      // when a gate fires, so it indexes past the end for up to 122 ms.
      if (flat >= size) flat = size - 1;
    }

    if ($mode !== mode) {
      $mode = mode;
      // A mode change re-derives the *direction* and leaves the position
      // alone, which is what Yarns does. Restarting the pattern here would
      // make a modulated `mode` - a slow LFO patched into it, an arpeggiator
      // whose direction is itself sequenced - unusable.
      if (mode === ArpMode.Up) direction = 1;
      else if (mode === ArpMode.Down) direction = -1;
    }

    if (!seeded) {
      // `Down` starts at the top, as Yarns does. Seeded on the first call and
      // not at construction, because `mode` is a parameter and is not known
      // until one arrives.
      seeded = true;
      if (mode === ArpMode.Down) {
        flat = size - 1;
        direction = -1;
      } else if (mode === ArpMode.RandomOther) {
        // Enter the bag rather than stepping into it: the engine emits the
        // note it is sitting on and *then* advances, so without this the
        // starting index would sound once before the first pass and once
        // inside it, and the first pass would not be a permutation.
        // `-1` because nothing has been played yet, so the boundary swap has
        // nothing to avoid.
        refill(-1);
        flat = bag[bagIndex++];
      }
    }

    // Emit, then advance: the first trigger sounds the note the sequence is
    // already sitting on, which for `Up` is the root. rune06's Juno
    // arpeggiator asserts the same thing of its own first note.
    if (detectGate(trigger) === true) {
      current = readNote();
      advance();
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
    let noteIndex: number;
    let octaveIndex: number;
    if ($octaveMode === ArpOctaveMode.Repeat) {
      noteIndex = Math.floor(flat / $octaves) % len;
      octaveIndex = flat % $octaves;
    } else {
      noteIndex = flat % len;
      octaveIndex = Math.floor(flat / len) % $octaves;
    }
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

  /**
   * One position drawn uniformly. The octave first and the note second, which
   * is the order the memoryless pick drew them in before the sequence had an
   * order; `flat` packs the two, so drawing the pair and drawing the index are
   * the same draw. Under `ArpOctaveMode.Repeat` the packing names a different
   * pair, which changes nothing: it is still uniform over the whole sequence,
   * which is all either random mode promises.
   */
  function drawFlat() {
    return Math.floor(random() * $octaves) * len + Math.floor(random() * len);
  }

  /**
   * Fisher-Yates over the whole sequence, written into the preallocated bag.
   * `avoid` is the position just played, or -1 if nothing has been.
   */
  function refill(avoid: number) {
    for (let i = 0; i < size; i++) bag[i] = i;
    for (let i = size - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      const t = bag[i];
      bag[i] = bag[j];
      bag[j] = t;
    }
    // Without this the boundary between two passes can repeat a note, which is
    // the one thing this mode promises cannot happen. A plain Fisher-Yates
    // gets it wrong once every `size` passes.
    if (size > 1 && bag[0] === avoid) {
      const j = 1 + Math.floor(random() * (size - 1));
      const t = bag[0];
      bag[0] = bag[j];
      bag[j] = t;
    }
    bagIndex = 0;
  }

  /** One step along the sequence, in whatever direction the mode implies. */
  function advance() {
    // Required, not defensive. Without it `UpDownExclusive` on a one-note set
    // loops forever - the exclusive turnaround sets `flat = size - 2 = -1`,
    // which immediately re-wraps - and that is an unbounded loop on the audio
    // thread, where the render quantum never returns and the context dies. It
    // was reachable from the shipped defaults until this ticket changed them:
    // `scale: 1` is the root alone. Plaits carries the same guard and calls it
    // "a corner case for the Up/down pattern code".
    if (size === 1) {
      flat = 0;
      return;
    }

    if ($mode === ArpMode.Random) {
      // Draw until it differs, which is what Plaits does. Bounded by the guard
      // above: with more than one entry in the sequence there is always
      // something else to draw, and the expected number of draws is
      // `size / (size - 1)` - 2.0 on a two-note set, 1.17 on a seven-note one.
      // It runs on triggers, not on samples.
      let next = drawFlat();
      while (next === flat) next = drawFlat();
      flat = next;
      return;
    }

    if ($mode === ArpMode.RandomOther) {
      if (bagIndex >= size) refill(flat);
      flat = bag[bagIndex++];
      return;
    }

    if ($mode === ArpMode.Up) direction = 1;
    else if ($mode === ArpMode.Down) direction = -1;
    flat += direction;

    while (flat >= size || flat < 0) {
      if ($mode === ArpMode.Up || $mode === ArpMode.Down) {
        flat = (flat + size) % size;
        break;
      }
      // The turnaround, at the ends of the *whole* sequence and not of each
      // octave: the octave is inside the traversal, not outside it.
      direction = -direction;
      const inclusive = $mode === ArpMode.UpDownInclusive;
      flat =
        direction > 0 ? (inclusive ? 0 : 1) : inclusive ? size - 1 : size - 2;
    }
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
