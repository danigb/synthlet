import { createGateDetector, gatePulse } from "./_gate";

/** One render quantum. The spec's block size, and the unit a consumer that
 * reads its trigger once per block can actually resolve. */
const RENDER_QUANTUM = 128;

/**
 * Renders one block.
 *
 * Takes the processor's `outputs` array rather than a positional buffer per
 * output, the way `packages/clock/src/dsp.ts` does and for the reason it
 * states: four outputs and four parameters is too many arguments to keep
 * straight, and an output added later is then an index rather than a signature
 * change. It is a plain nested array with nothing from the worklet global
 * scope in it - `dsp.test.ts` builds one by hand.
 *
 * Output 0 is the hits - channel a - and is not optional. Output 1 is the
 * rests; 2, 3 and 4 are the fan's channels b, c and d. All four of 1-4 may be
 * absent, which is the shape a test drives and never the shape the browser
 * hands over.
 */
export type GenerateFn = (
  outputs: Float32Array[][],
  clock: Float32Array,
  subdivision: number,
  swing: number,
  pulseWidth: number,
  spread: number,
  reset: Float32Array,
) => void;

export type UpdateFn = (steps: number, beats: number, rotation: number) => void;

export type ResetFn = () => void;

/**
 * The Euclidean rhythm engine: a pattern, a step counter, and the phase of an
 * incoming clock read a sample at a time.
 *
 * `Euclid` consumes a phase rather than a tempo - `Clock` owns the origin - so
 * everything here is a pure function of the ramp it is handed. There is no
 * sample rate in this file and no state that a test cannot drive directly.
 *
 * Five outputs, and they are one step read five times. Output 0 is the
 * pattern's hits - channel a; output 1 is the steps the hits leave empty; and
 * outputs 2, 3 and 4 are the fan - channels b, c and d, the same necklace
 * entered at three other places. There is one pattern, one step counter, one
 * clamped width, one `reset` and one `gatePulse` behind all five, so they
 * cannot skew and one `reset` aligns every one of them - which is the thing
 * five nodes could not have given.
 *
 * **The fan.** Channel `i` plays `Euclid.pattern(steps, beats, rotation + i *
 * spread)`: four entry points into one necklace, off one array, at no extra
 * state. `spread: 0` is unison and is the default, so a caller who never sets
 * it plays exactly what this module played before the parameter existed.
 *
 * The sign is worth stating once, here, because it reads backwards in the
 * code. `pattern` is *already* rotated by `rotation` when `generate()` gets
 * it, and `rotate` is a RIGHT rotation - `rotate(a, r)[j] === a[(j - r) mod
 * len]` - so moving a channel's entry point *forward* means reading the array
 * *backward*. Hence `generate()`'s `back`, which is `-spread` reduced into
 * `[0, n)`.
 *
 * **Swing.** `swing` moves one boundary inside each pair of steps - a pair's
 * two steps start at `0` and `swing / (1 + swing)` of the pair rather than `0`
 * and `0.5` - and it is applied to the one step phase every output is read
 * from, so all five swing identically and nothing per-output is involved. It
 * is applied against the *subdivision*, which is the whole argument for the
 * parameter being here rather than on `Clock`: a warp on the beat phase swings
 * eighths and gives a half-bar shuffle at `subdivision: 4`. `swing: 1` is
 * straight and bit-identical to no swing at all. See `stepPhase`.
 *
 * Returns three functions rather than an object: `generate` renders a block,
 * `update` rebuilds the pattern when one of its three parameters moved, and
 * `reset` arms the next step boundary to be step 0. `worklet.ts` calls the
 * first two; `reset` is returned so the empty-pattern case is reachable from a
 * test without a render quantum around it.
 *
 * Imports nothing from the worklet global scope, so it runs in node with no
 * `AudioWorkletProcessor` stub. `worklet.test.ts` is where the stub lives.
 * `packages/clock/src/dsp.ts` and `packages/arp/src/dsp.ts` are the same split,
 * and the three are read together.
 */
export function createEuclid(): [GenerateFn, UpdateFn, ResetFn] {
  let $steps = 1;
  let $beats = 1;
  let $rotation = 0;
  let pattern: number[] = [1];

  // state
  let prevClock = 0;
  let current = 0;
  const detectReset = createGateDetector();

  /**
   * Arm the next step boundary to be step 0 of the pattern.
   *
   * `step()` advances the counter *on* the boundary, so this aims one short of
   * 0 rather than at it: `current = 0` here would advance to step 1, which is
   * the off-by-one that makes a reset land on the wrong step. `prevClock = 1`
   * makes the very next sample read as a boundary - every phase is below 1 -
   * so the reset takes effect on its own sample.
   *
   * `pattern.length - 1` is `-1` on the empty pattern, and `pattern[-1] * gate`
   * is `NaN`. `steps: 0` is a declared value: it means silence, not a dead node.
   */
  function reset() {
    current = pattern.length ? pattern.length - 1 : 0;
    prevClock = 1;
  }

  // A hit is a *pulse* over the first `pulseWidth` of its step, not the step's
  // level held to the next step. Held levels merge adjacent hits - there is no
  // falling edge between them, so no rising edge for the second, and a 4/4
  // pattern used to fire exactly once, ever.
  //
  // The step boundary is a *phase-ramp wrap*, `currentClock < prevClock`, and
  // not the library's `> 0` gate. `_gate.ts`'s header describes that contract
  // and invites the opposite assumption, so: a ramp is not a gate. Every
  // sample of a running clock is positive, so `> 0` would latch on at the
  // first one and never see a step again. `createGateDetector` is imported
  // here for `reset` alone, which genuinely is a gate.
  function step(
    clock: number,
    subdivision: number,
    paired: number,
    swingPoint: number,
    pulseWidth: number,
  ) {
    // The one line swing warps, and the only one it needs to: `gate`,
    // `prevClock`, `current`, and every one of the five reads `generate()`
    // makes hang off this value, so all five outputs swing together and
    // nothing per-output is involved. See `stepPhase`.
    const currentClock = stepPhase(clock * subdivision, paired, swingPoint);
    const gate = currentClock < prevClock;
    prevClock = currentClock;
    // Advance the pattern. `% 0` on the empty pattern is `NaN`, and a `NaN`
    // counter never recovers - so it does not advance at all when there is
    // nothing to advance through.
    if (gate && pattern.length) current = (current + 1) % pattern.length;
    // One `gatePulse` call per sample, returned rather than applied. Every
    // output is this pulse times a 0 or a 1 read out of one array at one of
    // five offsets from one counter - which is what "the outputs cannot skew"
    // means, mechanically.
    //
    // `generate` does the reads because it is in this closure and can see
    // `pattern` and `current`. Five levels returned from here would be five
    // closure variables, and ticket 05's single `restLevel` does not
    // generalise - so it is gone, and the closure holds one variable *fewer*
    // than it did with two outputs.
    return gatePulse(currentClock, pulseWidth);
  }

  function generate(
    outputs: Float32Array[][],
    clock: Float32Array,
    subdivision: number,
    swing: number,
    pulseWidth: number,
    spread: number,
    resetIn: Float32Array,
  ) {
    const output = outputs[0][0];
    const restsOut = outputs[1]?.[0];
    const bOut = outputs[2]?.[0];
    const cOut = outputs[3]?.[0];
    const dOut = outputs[4]?.[0];
    // All five outputs are always connected in the browser - `index.ts` hangs
    // a GainNode off each of 1-4 whether or not the caller touches them, and
    // the spec hands `process()` a zero-filled buffer for every declared
    // output regardless - so these guards are what let a test drive the engine
    // with one buffer, not a saving anyone pays for. See the README, which
    // says the same thing.
    const wantRests = restsOut !== undefined;
    const wantB = bOut !== undefined;
    const wantC = cOut !== undefined;
    const wantD = dOut !== undefined;

    // `pattern` cannot change inside a block - `update()` runs once per block,
    // before this, and `reset()` does not change the length - so `n` hoists.
    const n = pattern.length;
    // Channel `i` is the pattern at `rotation + i * spread`. `pattern` is
    // already rotated by `rotation` when it gets here, and `rotate` is a RIGHT
    // rotation - `rotate(a, r)[j] === a[(j - r) mod len]` - so rotating the
    // entry point *forward* means reading the array *backward*. Hence the
    // negation: `back` is `-spread` reduced into `[0, n)`, and channel `i`
    // reads `(current + i * back) mod n`.
    //
    // The other sign is self-consistent and is what the ticket's prose says,
    // and it fans the other way: channel `i` would be `rotation - i * spread`,
    // so `{rotation: 0, spread: 2}` on E(7,16) would give 0, 14, 12, 10 rather
    // than 0, 2, 4, 6 - and the README's table of Toussaint's played variants
    // counts in positive rotations. The fan runs the way the documentation
    // counts.
    //
    // `spread` is a count off an AudioParam, so it is a float, and
    // `pattern[3.5]` is `undefined` while `undefined * pulse` is NaN - the
    // same shape as the three NaN paths ticket 02 closed. Floored here rather
    // than in `update()` because the fan rebuilds nothing: `spread` never
    // reaches `update()`, and if it ever does, the design drifted.
    //
    // `Number.isFinite` because `Infinity % n` and `NaN % n` are both NaN. An
    // AudioParam clamps to the declared range so neither should arrive - and
    // `clock` declares a range too, and ticket 02 still had to guard it.
    //
    // k-rate, so this is three integers per block and the per-sample cost is
    // one add and one modulo per channel. `current` and each `i * back` are
    // both below `n`, so the sum is below `2n` and one `%` reduces it.
    //
    // Written `(n - (s % n)) % n` and not the more obvious `((-s % n) + n) % n`
    // because the latter evaluates `-0` whenever `s` is a multiple of `n` -
    // `-0 % 16` is `-0` - and `-0` is a double rather than a Smi, so V8 gives
    // the whole expression double type feedback and the per-sample `%` in the
    // loop below stops being integer arithmetic. Measured: the `-0` form costs
    // 2.30 us/block against 1.65 at exactly the settings where `s % n === 0`,
    // and flat 1.65 either side of them. Those settings are the unison ones -
    // `spread: 0` is one of them, and it is the **default** - so the obvious
    // form put a 40% penalty on the path every existing caller takes. The two
    // are numerically identical over `n` 1…64 and `s` -200…200, verified.
    const s = Math.floor(spread);
    const back = n && Number.isFinite(s) ? (n - (s % n)) % n : 0;
    const back2 = n ? (2 * back) % n : 0;
    const back3 = n ? (3 * back) % n : 0;

    // All three k-rate, so all three once per block. 07 spent half a ticket
    // taking per-sample work off this path and a modulo and two divides per
    // sample would put some back. They are passed into `step()` as arguments
    // rather than kept in the closure, because this file's header says no
    // state a test cannot drive directly and everything else `step()` reads is
    // an argument.
    //
    // `swing` is a ratio of r : 1, and `swingPoint` is where inside the pair
    // that puts the second step: 0.5 straight, 0.667 triplet, 0.75 at the
    // declared maximum. `1 / (1 + 1)` is 0.5 exactly, so the straight case
    // reaches the same branch every other setting does.
    const swingPoint = swing / (1 + swing);
    // `2 * Math.floor(subdivision / 2)` - the part of the cycle whole pairs
    // cover. The remainder, at an odd `subdivision`, is one straight
    // full-length step. See `stepPhase`.
    //
    // Written as a subtraction and not `2 * Math.floor(subdivision / 2)`
    // because `subdivision` is a non-negative float off an `AudioParam` and
    // `x % 2` on it stays a small positive double; the shape to avoid on this
    // path is a `%` that can produce `-0`, which 06 measured at a 40% penalty
    // on the whole loop. Neither operand here can be negative.
    const paired = subdivision - (subdivision % 2);
    // The clamp is per *step*, and under swing the two steps of a pair are not
    // the same length: the step phase advances at `increment / half`, so the
    // short step - `1 - swingPoint`, the smaller half over the declared range
    // - has the largest increment and its cap is the binding one. Clock ticket
    // 04's guarantee is "a render quantum low in every step", so it has to be
    // computed against the shortest step and not the average. Exactly 1 at
    // `swing: 1`, and `y * 1 === y` for every float, so the straight case
    // computes the same width it computed before this parameter existed.
    const shortStep = 0.5 / (1 - swingPoint);

    // The house a-rate check, hoisted. An unautomated `clock` arrives as one
    // value and the whole block is one step of the ramp, which is what this
    // did before and costs the same. `reset` is read the same way, and its
    // length-1 case - unconnected, or a connected constant - is the common one.
    const rRate = resetIn.length > 1;
    if (clock.length > 1) {
      const width = clampWidth(
        pulseWidth,
        stepIncrement(clock) * subdivision * shortStep,
      );
      for (let i = 0; i < output.length; i++) {
        if (detectReset(rRate ? resetIn[i] : resetIn[0]) === true) reset();
        const pulse = step(clock[i], subdivision, paired, swingPoint, width);
        // The floor. `current` is in range by construction - `update` clamps it
        // on every rebuild and `step` reduces it on every boundary - so `n ?`
        // guards the one case that is not an index at all: the empty pattern,
        // where `pattern[current]` is `undefined` and `undefined * 1` is `NaN`.
        // Narrow on purpose. `pattern[current] || 0` would be cheaper and would
        // also swallow an out-of-range index, which is a bug that should stay
        // loud. `steps: 0` is silence on all five outputs.
        const hit = n ? pattern[current] : 0;
        output[i] = hit * pulse;
        // Lemma 3 (Morrill 2022): the complement of a Euclidean rhythm is a
        // Euclidean rhythm - E(n-k,n), at some rotation. That is the *proof*
        // output 1 is a rhythm worth having, not the recipe: the recipe is
        // `1 - hit`, and it needs no rotation arithmetic at all because
        // `pattern` is already rotated when it gets here.
        //
        // `n ?` is not decoration here either: on the empty pattern `hit` is 0
        // and `1 - hit` is 1, so without it `steps: 0` would silence the hits
        // and fire the rests on every step.
        //
        // The rests are the complement of **channel a only**, read at
        // `current` and unfanned. The complement of any other channel is one
        // patched node away - same `steps`, `beats`, `clock` and `reset`, the
        // rotation you want - because the complement commutes with rotation;
        // the *base* complement is the one that cannot be patched, which is
        // why it is an output and these are not.
        if (wantRests) restsOut![i] = n ? (1 - hit) * pulse : 0;
        if (wantB) bOut![i] = n ? pattern[(current + back) % n] * pulse : 0;
        if (wantC) cOut![i] = n ? pattern[(current + back2) % n] * pulse : 0;
        if (wantD) dOut![i] = n ? pattern[(current + back3) % n] * pulse : 0;
      }
    } else {
      // No increment to read and no within-block gate either: the whole block
      // is one value, on every output. The clamp has nothing to work with and
      // stands aside.
      if (detectReset(resetIn[0]) === true) reset();
      const pulse = step(clock[0], subdivision, paired, swingPoint, pulseWidth);
      const hit = n ? pattern[current] : 0;
      output.fill(hit * pulse);
      if (wantRests) restsOut!.fill(n ? (1 - hit) * pulse : 0);
      if (wantB) bOut!.fill(n ? pattern[(current + back) % n] * pulse : 0);
      if (wantC) cOut!.fill(n ? pattern[(current + back2) % n] * pulse : 0);
      if (wantD) dOut!.fill(n ? pattern[(current + back3) % n] * pulse : 0);
    }
  }

  function update(steps: number, beats: number, rotation: number) {
    // All three arrive from an `AudioParam` and are therefore floats, and all
    // three are counts. Uncoerced, `steps: 8.5` falls out of `i < steps` as a
    // nine-step pattern, `beats: 3.5` divides as 3.5 and puts four onsets in
    // what should be `E(3,8)`, and `rotation: 2.5` returns a seven-step pattern
    // from an eight-step one, because `rotate`'s two `slice` calls truncate
    // their arguments independently and the halves stop adding up to the whole.
    // Floored before the guard compares, so 8.0 -> 8.4 is not a rebuild either.
    //
    // `euclidPattern` floors all three again at its own boundary, because it is
    // public and `euclid()` floors nothing. On this path those three calls are
    // no-ops on already-integral values; the rebuild is k-rate and only happens
    // when a setting moved, so they cost nothing measurable. What they buy is
    // that `Euclid.pattern` and the engine are one expression rather than two
    // copies of it, and so cannot drift.
    steps = Math.floor(steps);
    beats = Math.floor(beats);
    rotation = Math.floor(rotation);
    if ($steps !== steps || $beats !== beats || $rotation !== rotation) {
      $steps = steps;
      $beats = beats;
      $rotation = rotation;
      pattern = euclidPattern($steps, $beats, $rotation);
      // The only place `pattern.length` can change, so the only place `current`
      // can be left pointing past the end - `step()` reduces it `% length`, but
      // only on a boundary. Turning a `steps` knob from 16 down to 8 while
      // `current` is 13 emitted `NaN` until the next boundary: 5 of 16 step
      // offsets, worst case 121.9 ms.
      current = pattern.length ? current % pattern.length : 0;
    }
  }

  return [generate, update, reset];
}

/**
 * The fractional part of a phase: `1.0` and above wrap back to `[0, 1)`.
 *
 * `subdivision` cycles fit in one clock cycle, so the phase of the current step
 * is the fractional part of the scaled ramp. This used to be
 * `while (p > 1) p -= 1`, up to `subdivision` subtractions per sample and
 * measured 5.8x slower at `subdivision: 20`.
 *
 * The loop also left `1.0` standing, which `gatePulse` reads as low - the one
 * value in the declared range that behaved unlike its neighbours, since a phase
 * pinned anywhere in `[0, pulseWidth)` holds the output high. `1 - floor(1)` is
 * `0`: the top of the ramp read as the bottom of the next step, which is what a
 * wrap means. `Clock` emits `[0, 1)` and never reaches it, but `clock` is an
 * ordinary `AudioParam` and anything can be patched in.
 *
 * No negative-input guard: `clock` declares `minValue: 0` and an `AudioParam`
 * clamps to its declared range, so a negative scaled phase is unreachable
 * through the module's own surface - and `Math.floor` would map `-0.3` to
 * `0.7`, the correct modular answer, where the loop left it at `-0.3`.
 *
 * Exported for `dsp.test.ts`, which checks it against the expression it
 * replaced across the whole declared range, and not re-exported from
 * `index.ts`. Measured, the call costs nothing: V8 inlines it.
 */
export function wrapPhase(phase: number) {
  return phase - Math.floor(phase);
}

/**
 * The phase of the current step, in `[0, 1)`, with swing applied.
 *
 * Not "delay the odd steps" - that phrasing invites an implementation that adds
 * a delay to an event and gets the gate width wrong. This moves **one boundary
 * inside each pair of steps**: a pair's two steps start at `0` and `swingPoint`
 * of the pair rather than `0` and `0.5`, and each step's phase is rescaled to
 * `[0, 1)` against its own - now unequal - length. So `pulseWidth` still means
 * "this fraction of *this* step", the boundary is still `phase < prevPhase`,
 * and a swung step's gate is not subtly wider than a straight one.
 *
 * `swingPoint` is `r / (1 + r)` for a ratio of `r : 1`: 0.5 straight, 0.667 for
 * triplet feel, 0.75 for the declared maximum of 3.
 *
 * At `swingPoint === 0.5` this is `wrapPhase(scaled)`, bit-for-bit and not
 * merely to within an epsilon. Writing `q = wrapPhase(scaled / 2)`: an even
 * `floor(scaled)` gives `q = w/2 < 0.5` and `q / 0.5 = w`; an odd one gives
 * `q = (w + 1)/2 >= 0.5` and `(q - 0.5) / 0.5 = w`. Every step of that is exact
 * in binary floating point - halving and doubling are exponent shifts, a
 * fractional part is a suffix of a significand, and `q - 0.5` for `q` in
 * `[0.5, 1)` is exact by Sterbenz. Measured over 4.8M samples across the
 * declared range of `clock` and `subdivision`, and over 46M samples of the
 * five outputs held against the pre-swing engine: zero differ. `swing: 1` is the
 * default, so the default is *provably* inert rather than approximately so.
 *
 * `paired` is `2 * floor(subdivision / 2)`, hoisted by the caller: the part of
 * the clock cycle that whole pairs cover. Pairs only tile a clock cycle when
 * `subdivision` is even, and above `paired` - reachable only at an odd
 * `subdivision` - is the **leftover step, which is straight and full length**.
 * That is a decision, not a fallback: letting the half-pair truncate would give
 * that step a phase spanning only `[0, 0.5/swingPoint)`, so any `pulseWidth`
 * above 0.67 would produce a gate that never falls in it. With the rule as
 * written, every clock cycle contains exactly `subdivision` boundaries at every
 * subdivision 1..20 and every swing 1..3 - measured, no cell drops or gains a
 * step - and the step lengths at `subdivision: 5, swing: 2` are
 * 1.333, 0.667, 1.333, 0.667, 1.000 straight steps.
 *
 * At `subdivision: 1` that makes `paired` 0, so every step is the leftover and
 * swing is **exactly inert** - bit-identical to no swing, measured across the
 * whole declared range. Which is right: swing subdivides the beat, and at
 * `subdivision: 1` the step is the beat.
 *
 * No guard on `swingPoint`. `swing` declares `1 ... 3` and an `AudioParam`
 * clamps to its declared range, so `swingPoint` is in `[0.5, 0.75]`, the
 * divides cannot approach zero, and a `swingPoint` below 0.5 - which would put
 * an extra boundary in the leftover half-pair - is unreachable through the
 * module's own surface. The same argument `wrapPhase` makes about negative
 * phases.
 *
 * Exported for `dsp.test.ts`, which holds it against `wrapPhase` over the whole
 * declared range, and not re-exported from `index.ts`.
 */
export function stepPhase(scaled: number, paired: number, swingPoint: number) {
  // The leftover step of an odd `subdivision`: straight, full length. Also the
  // one place `clock: 1` lands at an odd subdivision, which `wrapPhase` reads
  // as the bottom of the next step - see its own comment.
  if (scaled >= paired) return wrapPhase(scaled - paired);
  const pair = wrapPhase(scaled * 0.5);
  return pair < swingPoint
    ? pair / swingPoint
    : (pair - swingPoint) / (1 - swingPoint);
}

/**
 * The per-sample increment of an incoming phase ramp, read off the ramp.
 *
 * `Euclid` consumes a phase rather than a tempo, so it has no increment of its
 * own - but `clock` is a-rate, and two adjacent samples of a rising ramp are
 * its increment. A pair that straddles the wrap gives a negative delta; at most
 * one wrap falls inside a block at the tempi `Clock` declares (it wraps at
 * `bpm / 60` Hz, so 16.7 Hz at the declared maximum of 1000 BPM - one wrap per
 * 2646 samples at 44.1 kHz), so a second candidate is always enough.
 */
function stepIncrement(clock: Float32Array) {
  const first = clock[1] - clock[0];
  if (first > 0) return first;
  return clock.length > 2 ? Math.max(0, clock[2] - clock[1]) : 0;
}

/**
 * Cap a pulse width so at least one render quantum of every cycle stays low.
 *
 * `pulseWidth` declares a maximum of 1, and against a `[0, 1)` phase a width of
 * 1 is a gate that never falls - which under the library's gate contract can
 * never trigger anything again. `Clock` carries the same clamp against the beat;
 * this one is against the step, which is `subdivision` times faster.
 *
 * The extra sample is because the threshold is compared at discrete samples,
 * and the increment is read back off a Float32 ramp: asking for exactly 128
 * lands on 127 often enough to be worth it.
 *
 * Inert wherever it cannot help: an unmoving clock, or a step already shorter
 * than a quantum, leaves the width alone rather than silencing the gate.
 */
function clampWidth(pulseWidth: number, increment: number) {
  const maxWidth = 1 - (RENDER_QUANTUM + 1) * increment;
  return maxWidth > 0 && pulseWidth > maxWidth ? maxWidth : pulseWidth;
}

/**
 * The Euclidean rhythm of `beats` onsets distributed over `steps` steps.
 *
 * Morrill 2022, section 4. The rhythm is the *descents of the residue row*
 * `n_i = (beats * i) mod steps`: step `i` is an onset when `n_(i-1) > n_i`,
 * that is, when adding `beats` wrapped past `steps`. And `n_(i-1) > n_i` is
 * exactly `n_i < beats` - if `n_i >= beats` the previous residue is
 * `n_i - beats`, below it; if `n_i < beats` it is `n_i - beats + steps`, above
 * it. So the whole construction is the one comparison below.
 *
 * This is the construction the module has always used - a Bresenham line walked
 * over the step grid - evaluated in modular integers instead of accumulated
 * float. `Math.floor(i * (beats / steps))` accumulates the rounding error of a
 * binary division, and near a step boundary that error was enough to move an
 * onset: 39 settings inside the declared range produced a pattern that was not
 * a Euclidean rhythm at all. `E(18,66)` is the clearest, where Corollary 2
 * ("gcd(k, N) is equal to the number of occurrences of the minimal period")
 * requires six repetitions of an 11-pulse cell: the float form gave four clean
 * ones and then a cell that does not match, so the pattern has no repeating
 * period at all. `i * beats` peaks at 10000 over the declared range, far inside exact
 * float64, so nothing here can round.
 *
 * Two edges, decided rather than inherited:
 *
 * - **`beats: 0` is silence.** `0 < 0` is false, so every step is a rest. That
 *   is Morrill's Lemma 2, "contains exactly k notes". The float form seeded its
 *   accumulator at -1, so step 0 always compared unequal and always became an
 *   onset - `euclid(8, 0)` was `[1,0,0,0,0,0,0,0]`.
 * - **`beats > steps` is every step.** `(i * beats) % steps` is below `steps`,
 *   which is below `beats`, so every step is a hit. The papers restrict the
 *   construction to `0 <= beats <= steps` and say nothing past it; "more hits
 *   than places" is the reading taken here, and it is what shipped. `beats ===
 *   steps` is the same answer for the same reason, and is the paper's own
 *   definition of `E(N, N)`.
 *
 * `steps` and `beats` are integers by contract: `update()` floors all three of
 * its arguments before it compares them, so nothing non-integral reaches here.
 */
export function euclid(steps: number, beats: number) {
  const pattern: number[] = [];
  for (let i = 0; i < steps; i++)
    pattern[i] = (i * beats) % steps < beats ? 1 : 0;
  return pattern;
}

/**
 * Rotate a pattern right by `n` steps, wrapping. `n` may be negative or larger
 * than the pattern.
 *
 * **`n % len` is reduced before the zero short-circuit, and that order is the
 * whole of it.** Reduced after, `rotate(a, len)` fell through the `n === 0`
 * guard with `n` still `len`, and `array.slice(-0)` is `slice(0)` - the whole
 * array - so it returned `a.concat(a)`: a pattern of twice the length. It hit
 * every rotation that is a non-zero multiple of `len`, which is 482 of the
 * 10100 `(steps, rotation)` pairs reachable from the declared ranges.
 *
 * It was inaudible through the worklet, which is how it survived: a doubled
 * pattern is the same rhythm played twice over twice as many steps, and
 * `update()` clamps `current` into it. It is not inaudible through
 * `Euclid.pattern`, which is a public array whose whole purpose is to be the
 * thing people check a rotation against, and `Euclid.pattern(8, 3, 8)` handing
 * back sixteen elements is wrong on its face. Ticket 06's `spread` would have
 * met it constantly - `rotation + i * spread` walks straight through the
 * multiples.
 *
 * The fix is exactly behaviour-preserving on every input the old form answered
 * correctly: over `steps 1…64 × beats 0…steps × rotation 0…100` the two differ
 * on 5775 settings and all 5775 are cases where the old result was not `steps`
 * long. Zero well-formed answers changed.
 */
export function rotate(array: number[], n: number) {
  const len = array.length;
  if (len === 0) return array;
  n = n % len;
  if (n === 0) return array;
  if (n < 0) n = len + n;
  return array.slice(-n).concat(array.slice(0, len - n));
}

/**
 * The pattern `Euclid` plays at these settings: `beats` onsets distributed over
 * `steps` steps, rotated right by `rotation`. 1 is a hit, 0 a rest.
 *
 * The public form of the two lines `update()` runs, and `update()` runs *this* -
 * so the exported answer and the played pattern are the same expression and
 * cannot drift. That is the whole point of the export: a user's only way to
 * find out which rotation is the cinquillo is to look, so what they look at
 * has to be the thing that plays.
 *
 * All three are floored here rather than trusted. `update()` floors before its
 * change-guard so the engine's contract holds inside the module; this is a
 * public boundary and `euclid()` deliberately floors nothing of its own.
 * Nothing else is validated: out-of-range arguments do exactly what the worklet
 * does with them - `steps: 0` and a non-finite `steps` are both the empty
 * pattern, `beats` at or above `steps` is every step, and a negative or
 * oversized `rotation` wraps, because `rotate()` reduces `n % len`.
 *
 * Named `euclidPattern` and not `pattern` because `createEuclid()`'s closure
 * declares `let pattern`, which would shadow a module-level `pattern` inside
 * `update()` - the one function that has to call this. It is exposed as
 * `Euclid.pattern`, namespaced by the factory the way `Euclid.descriptors` is.
 */
export function euclidPattern(steps: number, beats: number, rotation = 0) {
  return rotate(
    euclid(Math.floor(steps), Math.floor(beats)),
    Math.floor(rotation),
  );
}

/** One named rhythm: the three settings that make `Euclid` play it. */
export type EuclidRhythmPreset = {
  steps: number;
  beats: number;
  rotation: number;
};

/**
 * The named rhythms of Toussaint 2005 §4, as settings you can spread.
 *
 * ```ts
 * Euclid(ac, { clock, ...EuclidRhythm.Cinquillo });
 * ```
 *
 * **These `rotation` values cannot be derived, only looked up.** A necklace
 * "disregards the starting point in the cycle" (Toussaint, §3), and where a
 * tradition enters the cycle is ethnomusicology rather than arithmetic: 13 of
 * the paper's 22 published rhythms come out right at `rotation: 0` and 9 do
 * not, and no stated rotation rule reproduces more than 13 either
 * (lexicographically-largest gets 5, lex-smallest-starting-on-an-onset gets 13,
 * biggest-gap-last gets 6). So this table is the answer to "which rotation is
 * the cinquillo", and `packages/euclid/src/dsp.test.ts` asserts every row of it
 * against the paper's own box notation.
 *
 * **These are necklaces.** Where Toussaint distinguishes the necklace from the
 * rhythm as played - E(5,16), E(7,16), E(9,16), E(11,24), E(13,24), which he
 * describes as "usually started on the third onset", the fifth, the penultimate
 * - the value here is E(k,n) itself, which is one unambiguous string per name.
 * The played variants are several per necklace; `packages/euclid/README.md`
 * carries them with their rotations.
 *
 * Not an enum, unlike `ArpScale`: an entry is three numbers, not one, and the
 * point of it is that it spreads into `EuclidInputs`.
 */
export const EuclidRhythm = {
  Tresillo: { steps: 8, beats: 3, rotation: 0 },
  Cinquillo: { steps: 8, beats: 5, rotation: 6 },
  BossaNova: { steps: 16, beats: 5, rotation: 12 },
  Samba: { steps: 16, beats: 7, rotation: 0 },
  AshantiMpre: { steps: 12, beats: 7, rotation: 8 },
  CentralAfricanRepublic: { steps: 16, beats: 9, rotation: 10 },
  AkaPygmy: { steps: 24, beats: 11, rotation: 0 },
  Venda: { steps: 12, beats: 5, rotation: 0 },
  KhafifERamal: { steps: 5, beats: 2, rotation: 2 },
  Ruchenitza: { steps: 7, beats: 3, rotation: 4 },
  Aksak: { steps: 9, beats: 4, rotation: 6 },
  Moussorgsky: { steps: 11, beats: 5, rotation: 8 },
  Cumbia: { steps: 4, beats: 3, rotation: 0 },
  Tuareg: { steps: 8, beats: 7, rotation: 0 },
  AkaPygmyUpperSangha: { steps: 24, beats: 13, rotation: 14 },
  Zappa: { steps: 11, beats: 4, rotation: 0 },
} as const satisfies Record<string, EuclidRhythmPreset>;

export type EuclidRhythmName = keyof typeof EuclidRhythm;
