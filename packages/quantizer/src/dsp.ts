/**
 * Which quantity leaves the node.
 *
 * `Hz` is the default because every pitch inlet in this library is a frequency
 * - `PolyblepOscillator.frequency`, `Svf.frequency`, `KarplusStrong.frequency`
 * - so the common patch is one connection with no converter in between.
 *
 * `Note` keeps the value in semitones, for the two cases that want it: a
 * second quantizer downstream, and a `detune` inlet in cents through
 * `Param.mul(ac, quantizer, 100)`.
 */
export enum QuantizerOutput {
  Hz = 0,
  Note = 1,
}

/**
 * The closure `worklet.ts` calls once per sample. `searches` is a test seam,
 * not a parameter: it counts the times the note actually had to be looked up,
 * which is how "the search does not run while the input stays in its zone" is
 * asserted rather than assumed.
 */
export type QuantizerUpdate = {
  (
    input: number,
    scale: number,
    root: number,
    hysteresis: number,
    output: number,
  ): number;
  /** How many times the allowed-note search has run since construction. */
  searches: number;
};

/**
 * The engine: a note number in, the nearest note of a scale out.
 *
 * **It stores a zone, not a note.** The expensive half of quantising is
 * deciding *which* note, and `input` is a-rate - the worklet calls this 128
 * times a block for a value that a sample-and-hold changes once a beat and a
 * slew limiter changes by a thousandth of a semitone. So the state is the
 * current note's boundary interval, and the hot path is two comparisons
 * against it. Braids' quantiser is built the same way
 * (`braids/quantizer.cc:46-105`) and for the second reason too: a value
 * hovering on a boundary would otherwise flip between two notes on every
 * sample, which is inaudible from a stepped source and very audible from a
 * slewed or LFO'd one.
 *
 * Widening that interval by `hysteresis` on both sides is the whole of the
 * anti-chatter fix - a Schmitt trigger on a note. `hysteresis: 0` turns it off
 * and gives the plain nearest-note rule, which with `Scale.Chromatic` is a
 * note-number-to-hertz converter and nothing else.
 *
 * **The boundary is the midpoint, and ties go up.** Reid's Table 1 gives each
 * note a band from -1/24 V inclusive to +1/24 V exclusive; with a non-uniform
 * scale the same rule applies to the two nearest *allowed* notes, so in C
 * major the C/D boundary is 61.0 and the zone is `[lo, hi)`. 60.9 is C - it is
 * 0.9 from C and 1.1 from D - and 61.0 is D.
 */
export function createQuantizer(): QuantizerUpdate {
  // Every MIDI note the mask allows, ascending, and how many there are. Sized
  // at the whole MIDI range and filled in place: this is the one allocation in
  // the module, and it happens before the graph is running.
  const allowed = new Int8Array(128);
  let count = 0;

  // -1 in both, so the first call always takes the rebuild branch: a caller
  // asking for `scale: 0` still gets a table built for it.
  let $scale = -1;
  let $root = -1;

  // The current note, its index in `allowed`, and its un-widened zone. The
  // zone is `[lo, hi)` and reaches to infinity at the two ends, so the first
  // and last allowed notes catch everything beyond them without a special
  // case. `hi <= lo` is the "nothing decided yet" state, which no real zone
  // can be.
  let note = 0;
  let index = 0;
  let lo = 0;
  let hi = 0;

  // The note-to-frequency conversion, memoised on the note, for the same
  // reason `arp` memoises it: a-rate means 128 calls a block for a value that
  // changes at most once in it. Without the cache that is 128 `Math.pow`s.
  let $note = NaN;
  let $frequency = 0;

  // `Object.assign` rather than a property set afterwards, so that `searches`
  // is part of the value's type from the start and the body below can read the
  // same binding the caller sees.
  const update: QuantizerUpdate = Object.assign(
    function quantize(
      input: number,
      scale: number,
      root: number,
      hysteresis: number,
      output: number,
    ): number {
      // Floored, because a root between two pitch classes is not a key, and
      // written as a comparison so that a NaN - which `>= 0` is false for -
      // lands on C rather than propagating into the graph. `minValue: 0` is
      // enforced by the parameter, not by this function, which the tests call
      // directly.
      const r = root >= 0 ? Math.floor(root) : 0;

      if ($scale !== scale || $root !== r) {
        $scale = scale;
        $root = r;

        // An empty mask is the root alone, the same fallback `getPitchClasses`
        // makes. The bit test is used directly rather than that decoder because
        // it returns an array: this branch runs whenever a scale picker moves,
        // and allocating on a parameter change is the one thing a worklet must
        // not do.
        const mask = scale ? scale : 1;
        count = 0;
        for (let i = 0; i < 128; i++) {
          // Two moduli, because `r` may be any integer: the mask is relative to
          // the root, and `(i - r)` is negative for the notes below it.
          if (mask & (1 << ((((i - r) % 12) + 12) % 12))) allowed[count++] = i;
        }

        // The table moved under it, so the cached zone means nothing now.
        hi = lo;
      }

      // Clamp, and NaN with it: `input` is declared 0...127 and a note number
      // outside that has no frequency anyone can play. Written as two nested
      // comparisons rather than `Math.min(Math.max(...))` because `NaN >= 0` is
      // false, so a NaN arriving from an unconnected graph becomes MIDI 0
      // instead of a NaN in everything downstream.
      const n = input >= 0 ? (input <= 127 ? input : 127) : 0;

      if (n < lo - hysteresis || n >= hi + hysteresis) {
        update.searches++;

        // The first allowed note at or above `n`. A binary search rather than a
        // walk because the two are the same length to write and this one does
        // not care how far the input jumped - a sample-and-hold of noise jumps
        // two octaves between one block and the next.
        let low = 0;
        let high = count;
        while (low < high) {
          const mid = (low + high) >> 1;
          if (allowed[mid] < n) low = mid + 1;
          else high = mid;
        }

        // Nearest of the two neighbours, ties up: `>=` and not `>`, which is
        // what makes 61 in C major a D rather than a C.
        if (low === 0) index = 0;
        else if (low === count) index = count - 1;
        else index = n - allowed[low - 1] >= allowed[low] - n ? low : low - 1;

        note = allowed[index];
        lo = index > 0 ? (allowed[index - 1] + note) / 2 : -Infinity;
        hi = index < count - 1 ? (note + allowed[index + 1]) / 2 : Infinity;
      }

      if (output >= QuantizerOutput.Note) return note;

      if (note !== $note) {
        $note = note;
        $frequency = 440 * Math.pow(2, (note - 69) / 12);
      }
      return $frequency;
    },
    { searches: 0 },
  );

  return update;
}
