import { createDelayLine } from "./_delay";

// A delay-line granulator: Bencina 2001's first variant, "appropriate for
// 'effects' processing of real-time input". With `digital-delay` and
// `analog-delay` shipped it is the third delay in the catalogue, split from them
// on the read strategy - tap, glide, grain cloud - all three over the same
// `scripts/_delay.ts`. The structure is his object model in one closure: a
// scheduler deciding *when* a grain starts, a pool of reusable grains, and per
// grain an envelope paired with a source read. Interonset time and grain
// duration are separate quantities from separate controls - his structural
// point, and what the old module collapsed into one phasor.
//
// **A grain playhead is a moving delay.** That is the one idea the file rests
// on, and why `_delay.ts` needed no change to carry a cloud: a grain playing at
// rate `r` while the write head advances at 1x is a read whose delay moves by
// `-(r - 1)` per sample. At `r = 1` it is constant and the grain tracks the
// input; at `r = 2` it closes on the write head a sample per sample, which is
// what the clamp in `activate()` is for. When ticket 05 stops calling
// `write()`, the same expression with `-r` is freeze - no special addressing
// mode, and no branch here today.
//
// **Grain integrity is the data-layout rule**, and it is EC2's: "a grain is
// immutable after emission; it will play through entirely and it will not skip
// from one position in the source sound file to another discontinuously." Every
// field is sampled once, in `activate()`; nothing in the render loop reads a
// parameter. It is the invariant the old per-grain filter broke, and what makes
// ticket 03's randomisation a change to `activate()` alone.
//
// Pure: no worklet globals in this file, so `dsp.test.ts` runs in node.

/** Grains allocated at construction. Clouds' number; EC2 allocates 2,048. */
export const DEFAULT_MAX_GRAINS = 64;

/**
 * How far back `position` reaches, in seconds. Not an `AudioParam`: it sizes an
 * allocation, so it is fixed at construction. Two lines cost ~2 MB at 44.1 kHz.
 */
export const DEFAULT_BUFFER_SECONDS = 4;

/**
 * The envelope's mean square. A constant rather than a function of `shape`:
 * substituting `u` either side of the peak turns the integral into
 * `int_0^1 (1/2 - cos(pi*u)/2)^2 du = 3/8` whatever fraction of the grain the
 * rise occupies, so the morph changes a grain's shape and not its level.
 */
const ENVELOPE_MEAN_SQUARE = 3 / 8;

/**
 * So the envelope is normalised to **unit RMS**, not unit peak: 1.633.
 *
 * At one grain of overlap - grains abutting, `rate * duration = 1` - the output
 * is the input times a periodic envelope, so a unit-peak window would put a
 * fully wet stream `sqrt(3/8)` = 4.26 dB below its input. Normalising the
 * window's *power* makes that case exactly unity, and lands the `1/sqrt(n-1)`
 * law below at unity too, that law being a power law as well. Not the x2 the
 * rewrite removed: that was `length/sum` - `1/mean`, an *amplitude*
 * normalisation - on top of no gain normalisation at all.
 */
const WINDOW_GAIN = Math.sqrt(1 / ENVELOPE_MEAN_SQUARE);

/**
 * Clouds' one-pole on the normalisation gain (`:152-165`). The active count is
 * an integer that steps as grains are born and retire, and without this every
 * step is a step in level. 0.01 is about 2.3 ms at 44.1 kHz.
 */
const GAIN_SMOOTHING = 0.01;

/**
 * The shortest rise or fall, as a fraction of the grain: `shape` maps the peak's
 * position over `[0.05, 0.95]` and not `[0, 1]`, because at 0 the envelope would
 * step to full scale in one sample, which is a click and not an expodec. 5% is
 * 3 ms at the default 60 ms, and being a fraction it stays a shape, not a time.
 */
const MIN_RISE = 0.05;

/** Envelope table resolution. 1024 points plus a guard for the interpolator. */
const ENVELOPE_POINTS = 1024;

export type GranulatorConfig = {
  /** Grains allocated at construction. Default 64. */
  maxGrains?: number;
  /** How far back `position` reaches, in seconds. Default 4. */
  bufferSeconds?: number;
};

/**
 * One grain's whole state, written by `activate()` and read by the render loop.
 * `delay` is the read distance behind the write head and moves by `delayStep`
 * (`1 - ratio`) each sample; `phase` runs 0 to 1 across the grain and peaks at
 * `peak`, whose two sides need the reciprocals beside it; `gainL`/`gainR` are 1
 * until ticket 03 draws them from `pan` and `panSpread`.
 */
type Grain = {
  delay: number;
  delayStep: number;
  remaining: number;
  phase: number;
  phaseInc: number;
  peak: number;
  invRise: number;
  invFall: number;
  gainL: number;
  gainR: number;
};

/**
 * A cloud of overlapping windowed reads over a stereo pair of delay lines.
 *
 * ```ts
 * const granite = createGranulator(44100);
 * granite.update(40, 60, 0.3, 12, 0.5, 1); // params.ts order
 * granite.process(inL, inR, outL, outR);
 * ```
 */
export function createGranulator(
  sampleRate: number,
  config: GranulatorConfig = {},
) {
  const maxGrains = Math.max(1, config.maxGrains ?? DEFAULT_MAX_GRAINS);
  // `position`'s reach and the allocation are the same number, so they cannot
  // drift apart. Deliberately *not* `line.size - 4`: the line rounds up to a
  // power of two, 5.9 s at 4 s and 44.1 kHz, and `position: 1` would then reach
  // half again as far back as the option says. The floor keeps a quarter of the
  // buffer - the clamp's ceiling on a grain - above 64 samples in any config.
  const bufferSize = Math.max(
    256,
    Math.round((config.bufferSeconds ?? DEFAULT_BUFFER_SECONDS) * sampleRate),
  );
  const lines = [createDelayLine(bufferSize), createDelayLine(bufferSize)];

  // `0.5 - 0.5*cos(pi*u)` over `u` in [0, 1]: 0 at a grain's edge, 1 at its
  // peak, zero slope at both, so no shape in the morph starts or ends on a
  // discontinuity. One table serves every `shape`, because asymmetry moves
  // *where* the peak is and not the curve either side of it. The last entry is
  // a guard for the interpolator's `j + 1` when `u` lands exactly on 1.
  const envelope = new Float32Array(ENVELOPE_POINTS + 2);
  for (let i = 0; i <= ENVELOPE_POINTS; i++) {
    envelope[i] = 0.5 - 0.5 * Math.cos((Math.PI * i) / ENVELOPE_POINTS);
  }
  envelope[ENVELOPE_POINTS + 1] = envelope[ENVELOPE_POINTS];

  // The pool, preallocated whole. Nothing below allocates.
  const grains: Grain[] = [];
  for (let i = 0; i < maxGrains; i++) {
    grains.push({
      delay: 0,
      delayStep: 0,
      remaining: 0,
      phase: 0,
      phaseInc: 0,
      peak: 0.5,
      invRise: 2,
      invFall: 2,
      gainL: 1,
      gainR: 1,
    });
  }
  // Two index lists rather than a scan over the pool: `free` is a stack of
  // slots, `active` the render loop's worklist. Both O(1), and the loop costs
  // what is *playing* rather than what is allocated - EC2's own benchmark,
  // "computational demand varies in proportion to the number of concurrently
  // active grains rather than grains per second".
  const free = new Int32Array(maxGrains);
  const active = new Int32Array(maxGrains);
  let freeCount = maxGrains;
  let activeCount = 0;
  for (let i = 0; i < maxGrains; i++) free[i] = i;

  // Control values, read once per block by `update()` and never in the loop.
  let interonset = Infinity;
  let durationSamples = 0.06 * sampleRate;
  let position = 0;
  let ratio = 1;
  let peak = 0.5;
  let wet = 1;

  let countdown = 0;
  let gain = WINDOW_GAIN;

  /** Instrumentation. Read by the tests; nothing in the DSP branches on it. */
  const stats = {
    activations: 0,
    dropped: 0,
    peakActive: 0,
    minDelay: Infinity,
    maxDelay: 0,
  };

  function update(
    rate: number,
    duration: number,
    position_: number,
    pitch: number,
    shape: number,
    wet_: number,
  ) {
    // One sample is the floor, so at most one grain is born per sample and the
    // scheduler needs no inner loop. 2,000 grains/s is 22 samples.
    interonset = rate > 0 ? Math.max(1, sampleRate / rate) : Infinity;
    // `rate: 0` is silence, and an infinite countdown is how the render loop
    // says so without a branch of its own. Otherwise a rate that has just risen
    // takes effect now rather than after the interval it was set during - which
    // is also what lets `rate` come back from 0.
    countdown =
      interonset === Infinity ? Infinity : Math.min(countdown, interonset);

    durationSamples = Math.max(1, (duration / 1000) * sampleRate);
    position = position_ < 0 ? 0 : position_ > 1 ? 1 : position_;
    ratio = Math.pow(2, pitch / 12);
    peak =
      MIN_RISE + (1 - 2 * MIN_RISE) * (shape < 0 ? 0 : shape > 1 ? 1 : shape);
    wet = wet_ < 0 ? 0 : wet_ > 1 ? 1 : wet_;
  }

  /**
   * Starts one grain, at the sample the scheduler reached zero on.
   *
   * The clamp is Clouds' (`granular_sample_player.h:205-224`), which is
   * Bencina's hazard solved: "if a delay tap has a playback rate greater than
   * unity, care must be taken to avoid the non-causal case of trying to read
   * 'future samples' from the delay line.
   *
   *     if (ratio > 1) grainSize = min(grainSize, bufferSize * 0.25 / ratio)
   *     available = bufferSize - grainSize*ratio - grainSize
   *     start     = head - (position * available + grainSize*ratio)
   *
   * `available` is what is left once both heads are paid for: the play head
   * eats `grainSize*ratio`, the material it covers, and the record head eats
   * `grainSize`, what it overwrites while the grain plays. `position` scrubs
   * the remainder, so its reach shrinks as `duration` and `pitch` rise.
   *
   * As a delay rather than an absolute index, `start` is just
   * `position*available + grainSize*ratio`, and `readHermite`'s bounds follow by
   * arithmetic rather than by luck: the delay travels linearly from there to
   * `position*available + grainSize`, staying inside
   * `[grainSize, bufferSize - grainSize*min(ratio, 1)]`, a subset of
   * `[1, size - 4]` because `size - 4 >= bufferSize` and `grainSize >= 1`.
   * `dsp.test.ts` asserts that against an instrumented read rather than
   * trusting this paragraph.
   */
  function activate() {
    stats.activations++;
    if (freeCount === 0) {
      // **Overflow policy: no free grain, no grain.** No playing grain is
      // stolen - that would break grain integrity, the one invariant this
      // engine has - and Clouds and EC2 both drop too. The scheduler still
      // advances, so density recovers as soon as slots do.
      stats.dropped++;
      return;
    }

    let grainSize = durationSamples;
    if (ratio > 1) grainSize = Math.min(grainSize, (bufferSize * 0.25) / ratio);
    // And unconditionally, which Clouds does not need and this does: its buffer
    // is fixed where `bufferSeconds` is an option, so a short buffer with a long
    // `duration` would drive `available` negative. At the default it never bites
    // - `duration.maxValue` *is* this quarter.
    grainSize = Math.max(1, Math.min(grainSize, bufferSize * 0.25));

    const available = bufferSize - grainSize * ratio - grainSize;
    const delay = position * available + grainSize * ratio;
    const samples = Math.max(1, Math.round(grainSize));

    const index = free[--freeCount];
    const g = grains[index];
    g.delay = delay;
    g.delayStep = 1 - ratio;
    g.remaining = samples;
    g.phase = 0;
    g.phaseInc = 1 / samples;
    g.peak = peak;
    g.invRise = 1 / peak;
    g.invFall = 1 / (1 - peak);
    g.gainL = 1;
    g.gainR = 1;
    active[activeCount++] = index;

    // The delay is linear in time, so its two endpoints are its extremes.
    const end = delay + g.delayStep * (samples - 1);
    stats.minDelay = Math.min(stats.minDelay, delay, end);
    stats.maxDelay = Math.max(stats.maxDelay, delay, end);
    stats.peakActive = Math.max(stats.peakActive, activeCount);
  }

  /**
   * One render quantum. Allocation-free, and the scheduler runs *inside* it, so
   * a grain begins at the exact sample its counter reaches zero rather than at
   * the top of a block - Clouds' `pre_delay` (`grain.h:120-127`), and what
   * lifts the ceiling from `sampleRate/128` to the declared 2,000 per second.
   */
  function process(
    inL: Float32Array,
    inR: Float32Array,
    outL: Float32Array,
    outR: Float32Array,
  ) {
    const lineL = lines[0];
    const lineR = lines[1];

    for (let i = 0; i < outL.length; i++) {
      const dryL = inL[i];
      const dryR = inR[i];
      lineL.write(dryL);
      lineR.write(dryR);

      if (--countdown <= 0) {
        activate();
        countdown += interonset;
      }

      let sumL = 0;
      let sumR = 0;
      for (let k = 0; k < activeCount;) {
        const slot = active[k];
        const g = grains[slot];

        // The envelope, as a peak position rather than a formula per shape:
        // `u` runs 0 -> 1 over the rise and 1 -> 0 over the fall, one table for
        // both.
        let u =
          g.phase < g.peak ? g.phase * g.invRise : (1 - g.phase) * g.invFall;
        if (u < 0) u = 0;
        const x = u * ENVELOPE_POINTS;
        const j = x | 0;
        const f = x - j;
        const env = envelope[j] + (envelope[j + 1] - envelope[j]) * f;

        sumL += lineL.readHermite(g.delay) * env * g.gainL;
        sumR += lineR.readHermite(g.delay) * env * g.gainR;

        g.delay += g.delayStep;
        g.phase += g.phaseInc;
        if (--g.remaining > 0) {
          k++;
        } else {
          // Retire by swapping the last live slot into this one, so the
          // worklist stays dense and `k` is not advanced.
          free[freeCount++] = slot;
          active[k] = active[--activeCount];
        }
      }

      // Clouds' normalisation: `1/sqrt(n-1)`, the power law for grains that do
      // not correlate with each other, smoothed so a change in the count is not
      // a step in level. It is off below three grains, which is Clouds' rule and
      // costs +3 dB at exactly two overlaps - measured, and recorded in
      // `dsp.test.ts` beside the criterion it is the only miss against.
      const target =
        activeCount > 2
          ? WINDOW_GAIN / Math.sqrt(activeCount - 1)
          : WINDOW_GAIN;
      gain += GAIN_SMOOTHING * (target - gain);

      // Exact at `wet = 0`: `dry + 0 * anything` is `dry`, sample for sample.
      outL[i] = dryL + wet * (gain * sumL - dryL);
      outR[i] = dryR + wet * (gain * sumR - dryR);
    }
  }

  function reset() {
    lines[0].reset();
    lines[1].reset();
    for (let i = 0; i < maxGrains; i++) free[i] = i;
    freeCount = maxGrains;
    activeCount = 0;
    countdown = 0;
    gain = WINDOW_GAIN;
    stats.activations = 0;
    stats.dropped = 0;
    stats.peakActive = 0;
    stats.minDelay = Infinity;
    stats.maxDelay = 0;
  }

  return {
    update,
    process,
    reset,
    /** Test surface: `index.ts` never imports this file. */
    stats,
    lines,
    bufferSize,
    activeGrains: () => activeCount,
  };
}
