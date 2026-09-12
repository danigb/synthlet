// DON'T EDIT THIS FILE unless inside scripts/_traversal.ts
// use ./scripts/copy_files.sh to copy this file to the right place
// the goal is to avoid external dependencies on packages

// Which position in a sequence of notes plays next.
//
// The sequence itself is not here. This file stores **a position, not a note**:
// `flat` is one integer walking a `len * octaves` rectangle, and `read()`
// turns it into an index pair. What those indices name is the caller's
// business - a pitch class of a scale in `@synthlet/arp`, an entry of the held
// note stack in `@synthlet/instrument` - which is the whole reason the two can
// share one traversal without sharing anything else.
//
// It is pure. No nodes, no clock, no scale, no MIDI, no Hz. Every decision is
// made from an index, a length and a mode.
//
// ## Why this is shared rather than written twice
//
// Not code volume - it is about eighty lines. It is `advance`'s first branch:
//
//     if (size === 1) { flat = 0; return; }
//
// Without it `UpDownExclusive` on a one-note set loops forever, and on the
// audio thread that is a render quantum that never returns and a context that
// dies. An arpeggiator over *held* notes reaches `size === 1` constantly - one
// finger down - so a second implementation would have to rediscover the guard,
// and the exclusive/inclusive turnaround arithmetic besides.
//
// ## No allocation in the hot path
//
// `advance` and `resize` allocate nothing: the shuffle bag is a typed array
// sized once at construction. `read` returns one small index pair, which is
// the only allocation here - and it runs on triggers, not on samples.

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
 * Where a flat index lands: which entry of the set, and how many octaves up.
 *
 * Both are indices, never notes. The caller owns the set, so only the caller
 * can say what index 2 is.
 */
export type TraversalPosition = { noteIndex: number; octaveIndex: number };

export type Traversal = {
  /**
   * Re-read the shape of the set: `len` entries over `octaves` octaves.
   *
   * A no-op when neither has changed, so a caller that does not track changes
   * itself may call it on every step. When one has, the position is clamped
   * into the new range and the shuffle bag is invalidated.
   */
  resize(len: number, octaves: number): void;
  /** A change re-derives `direction` and leaves the position alone. */
  setMode(mode: ArpMode): void;
  setOctaveMode(mode: ArpOctaveMode): void;
  /** The position, as an index pair. Seeds on the first call. */
  read(): TraversalPosition;
  /** One step along the sequence, in whatever direction the mode implies. */
  advance(): void;
  /** Un-seed: the next `read` starts the mode's own first position. */
  reset(): void;
  /** How many entries the sequence has: every note, in every octave. */
  readonly size: number;
};

/**
 * A position walking a `len * octaves` sequence.
 *
 * ```ts
 * const traversal = createTraversal();
 * traversal.resize(3, 1);
 * traversal.read();    // { noteIndex: 0, octaveIndex: 0 }
 * traversal.advance();
 * traversal.read();    // { noteIndex: 1, octaveIndex: 0 }
 * ```
 *
 * @param capacity the largest sequence the caller can present, which sizes the
 *   shuffle bag once so a refill writes in place. `@synthlet/arp` declares
 *   twelve pitch classes over ten octaves; a held-note arpeggiator declares
 *   its stack capacity times its octave maximum.
 * @param random the source of randomness. It is an argument so the tests can
 *   assert a *sequence* rather than a distribution - without it every
 *   assertion over the random modes has to be hedged around `Math.random`.
 */
export function createTraversal(
  capacity = 120,
  random: () => number = Math.random,
): Traversal {
  // 1, not 0: the sequence is always at least the first entry of the set, so
  // `read` before any `resize` is a position rather than a division by zero.
  let len = 1;
  let octaves = 1;
  /** How many entries the sequence has: every note, in every octave. */
  let size = 1;

  /** Where in that sequence we are, and which way we are going. */
  let flat = 0;
  let direction = 1;
  let seeded = false;

  let mode: ArpMode = ArpMode.Up;
  let octaveMode: ArpOctaveMode = ArpOctaveMode.Serial;

  /**
   * `RandomOther`'s shuffle bag, preallocated at the largest sequence the
   * caller can declare, so a refill writes in place and nothing allocates on
   * a trigger.
   */
  const bag = new Int32Array(Math.max(1, capacity | 0));
  /** How far the bag has been drained. `>= size` means "refill before drawing". */
  let bagIndex = 0;

  /**
   * One position drawn uniformly. The octave first and the note second, which
   * is the order the memoryless pick drew them in before the sequence had an
   * order; `flat` packs the two, so drawing the pair and drawing the index are
   * the same draw. Under `ArpOctaveMode.Repeat` the packing names a different
   * pair, which changes nothing: it is still uniform over the whole sequence,
   * which is all either random mode promises.
   */
  function drawFlat() {
    return Math.floor(random() * octaves) * len + Math.floor(random() * len);
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

  return {
    resize(nextLen: number, nextOctaves: number): void {
      // Keyed on the shape and not on `size`: three notes over four octaves and
      // four over three are both twelve entries, but a position names a
      // different pair in each, so the bag's permutation is stale either way.
      if (len === nextLen && octaves === nextOctaves) return;
      len = nextLen;
      octaves = nextOctaves;
      size = nextLen * nextOctaves;
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
    },

    setMode(next: ArpMode): void {
      if (mode === next) return;
      mode = next;
      // A mode change re-derives the *direction* and leaves the position
      // alone, which is what Yarns does. Restarting the pattern here would
      // make a modulated `mode` - a slow LFO patched into it, an arpeggiator
      // whose direction is itself sequenced - unusable.
      if (next === ArpMode.Up) direction = 1;
      else if (next === ArpMode.Down) direction = -1;
    },

    setOctaveMode(next: ArpOctaveMode): void {
      // Structural, but it does not change `size` - it only changes which pair
      // a position names - so it cannot invalidate the shuffle bag.
      octaveMode = next;
    },

    read(): TraversalPosition {
      if (!seeded) {
        // `Down` starts at the top, as Yarns does. Seeded on the first read
        // and not at construction, because the mode is a parameter and is not
        // known until one arrives.
        seeded = true;
        if (mode === ArpMode.Down) {
          flat = size - 1;
          direction = -1;
        } else if (mode === ArpMode.RandomOther) {
          // Enter the bag rather than stepping into it: the caller emits the
          // position it is sitting on and *then* advances, so without this the
          // starting index would sound once before the first pass and once
          // inside it, and the first pass would not be a permutation.
          // `-1` because nothing has been played yet, so the boundary swap has
          // nothing to avoid.
          refill(-1);
          flat = bag[bagIndex++];
        }
      }

      if (octaveMode === ArpOctaveMode.Repeat) {
        return {
          noteIndex: Math.floor(flat / octaves) % len,
          octaveIndex: flat % octaves,
        };
      }
      return {
        noteIndex: flat % len,
        octaveIndex: Math.floor(flat / len) % octaves,
      };
    },

    advance(): void {
      // Required, not defensive. Without it `UpDownExclusive` on a one-note set
      // loops forever - the exclusive turnaround sets `flat = size - 2 = -1`,
      // which immediately re-wraps - and that is an unbounded loop on the audio
      // thread, where the render quantum never returns and the context dies. It
      // was reachable from `@synthlet/arp`'s shipped defaults until its ticket
      // 04 changed them: `scale: 1` is the root alone. A held-note arpeggiator
      // reaches it whenever one key is down. Plaits carries the same guard and
      // calls it "a corner case for the Up/down pattern code".
      if (size === 1) {
        flat = 0;
        return;
      }

      if (mode === ArpMode.Random) {
        // Draw until it differs, which is what Plaits does. Bounded by the
        // guard above: with more than one entry in the sequence there is always
        // something else to draw, and the expected number of draws is
        // `size / (size - 1)` - 2.0 on a two-note set, 1.17 on a seven-note
        // one. It runs on triggers, not on samples.
        let next = drawFlat();
        while (next === flat) next = drawFlat();
        flat = next;
        return;
      }

      if (mode === ArpMode.RandomOther) {
        if (bagIndex >= size) refill(flat);
        flat = bag[bagIndex++];
        return;
      }

      if (mode === ArpMode.Up) direction = 1;
      else if (mode === ArpMode.Down) direction = -1;
      flat += direction;

      while (flat >= size || flat < 0) {
        if (mode === ArpMode.Up || mode === ArpMode.Down) {
          flat = (flat + size) % size;
          break;
        }
        // The turnaround, at the ends of the *whole* sequence and not of each
        // octave: the octave is inside the traversal, not outside it.
        direction = -direction;
        const inclusive = mode === ArpMode.UpDownInclusive;
        flat =
          direction > 0 ? (inclusive ? 0 : 1) : inclusive ? size - 1 : size - 2;
      }
    },

    reset(): void {
      // The position as well as the seed: for `Up` the seed block does nothing,
      // so without this the "first step" would be wherever the pattern had got
      // to. `Down` and `RandomOther` re-seed on the next read.
      seeded = false;
      flat = 0;
      direction = 1;
      bagIndex = size;
    },

    get size(): number {
      return size;
    },
  };
}
