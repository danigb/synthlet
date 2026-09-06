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
// what the clamp in `activate()` is for. **Freeze is "don't call `write()`"**:
// with the head stopped the delay has to fall by `r` per sample instead of
// rising by `1 - r`, which is the same expression minus one, so the render loop
// subtracts a hoisted `advance` and there is no frozen addressing mode.
//
// **The randomness lives in two places, and they are different kinds.** Six
// draws per *grain* in `activate()` make every grain different (ticket 03); two
// draws per scheduled *onset* in the loop below scatter the stream in time
// (ticket 04). They have separate generators, because a grain's draws must not
// move when a scheduler parameter does - see `scheduleRandom`.
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

/**
 * The freeze crossfade, in samples. Truax's number, for exactly this splice:
 * "with most material, 100 samples per fade is inaudible and avoids
 * transients." 2.3 ms at 44.1 kHz, and a count rather than a time so it stays
 * the same *splice* at every sample rate.
 */
const FADE_SAMPLES = 100;

/**
 * The feedback high-pass corner, in Hz, as Clouds writes it
 * (`granular_processor.cc:190-203`) and as `digital-delay` already carries it:
 * `20 + 100*feedback^2`, so 20 Hz open and 110 Hz at this module's maximum
 * 0.95. The corner rises with the feedback because that is when a build-up has
 * time to happen. It is stability rather than tone, and it is always on.
 */
const feedbackCorner = (feedback: number) => 20 + 100 * feedback * feedback;

/** One-pole coefficient for a corner in Hz. `digital-delay`'s form. */
const onePole = (hz: number, sampleRate: number) =>
  1 - Math.exp((-2 * Math.PI * hz) / sampleRate);

/**
 * Alternating sign, so it cannot itself accumulate as DC. Without it a feedback
 * tail decaying towards zero ends up running entirely in denormals, and a loop
 * that never stops running never recovers from that. `digital-delay`'s value.
 */
const DENORMAL = 1e-20;

/**
 * The default seed. Two nodes given the same one produce the same cloud, which
 * is reproducible by design; `index.ts` says to pass different seeds for a
 * decorrelated stereo pair.
 */
export const DEFAULT_SEED = 0x9e3779b9;

/**
 * mulberry32: 32 bits of state, a full 2^32 period, and good enough that the
 * distribution tests can assert deciles rather than eyeball a histogram.
 *
 * **The library's idiom is `Math.random()`**, and
 * `wavetable-oscillator/src/stochastic.ts` argues against a shipped generator in
 * as many words - "shipping a PRNG here would put it in every user's processor
 * payload to serve a test". That argument loses here: granite draws six values
 * per grain at up to 2,000 grains a second, and three of its stated criteria are
 * *distributions* - uniform across an octave, 50% +/- 3% over 2,000 grains,
 * coverage to within 5% of the buffer's ends - which a global stub cannot make
 * reproducible across a suite that renders dozens of clouds. Five lines.
 */
function createRandom(seed: number) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The house comparison form, and the one ticket 02 already used inline: a NaN
 * fails both tests and falls through to 0 rather than propagating.
 */
const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);

export type GranulatorConfig = {
  /** Grains allocated at construction. Default 64. */
  maxGrains?: number;
  /** How far back `position` reaches, in seconds. Default 4. */
  bufferSeconds?: number;
  /** PRNG seed. Default `DEFAULT_SEED`. */
  seed?: number;
  /**
   * Called with each grain as it is activated. The test surface for everything
   * that is a *distribution* rather than a level; one predictable branch per
   * grain, never per sample, and no allocation.
   */
  onGrain?: (grain: Readonly<Grain>) => void;
};

/**
 * One grain's whole state, written by `activate()` and read by the render loop.
 * `delay` is the read distance behind the write head and moves by `delayStep`
 * each sample - `1 - ratio` forward, `1 + ratio` reversed; `phase` runs 0 to 1
 * across the grain and peaks at `peak`, whose two sides need the reciprocals
 * beside it; `gainL`/`gainR` carry the drawn pan and level.
 *
 * `ratio` and `reversed` are here for `onGrain` rather than for the render loop,
 * which needs only `delayStep`. Every field is written once, at activation, and
 * none is read from a parameter again - EC2's grain-integrity invariant, and the
 * reason this ticket is a change to `activate()` and nothing else.
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
  ratio: number;
  reversed: boolean;
};

/**
 * A cloud of overlapping windowed reads over a stereo pair of delay lines.
 *
 * ```ts
 * const granite = createGranulator(44100);
 * granite.update(...values); // params.ts order, sixteen of them
 * granite.process(inL, inR, outL, outR, stereo);
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
      ratio: 1,
      reversed: false,
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

  const seed = config.seed ?? DEFAULT_SEED;
  const onGrain = config.onGrain;
  let random = createRandom(seed);
  /**
   * A **second** generator, for the scheduler alone: one skip roll and one
   * jitter draw per scheduled onset, where `random` above serves the six
   * per-grain draws.
   *
   * Two more draws from `random` would displace every grain's draws by two and
   * change every sample of the output at *every* setting, including at
   * `jitter: 0, intermittency: 0` where ticket 04 requires bit-identity with
   * ticket 03. Drawing conditionally would fix that by abandoning ticket 03's
   * rule that draws are unconditional and ordered. A second generator keeps
   * both, and adds a third property worth more than either: the *n*th scheduled
   * onset sees the same `uSkip` whatever `jitter` is set to, so the set of
   * skipped grains is *identical* at `jitter: 0` and `jitter: 1` and the two
   * parameters are independent by construction rather than statistically.
   *
   * `seed ^ 0x5bf03635` (murmur3's third finalizer constant) rather than
   * `seed + k`: mulberry32 steps its state by a fixed odd increment, so *any*
   * two seeds walk the same cycle at some offset - the question is only how far
   * apart. An XOR puts that offset at no small integer; the expected distance is
   * of order 2^31 draws, about thirteen days of audio at the module's maximum
   * 2,000 onsets per second.
   */
  let scheduleRandom = createRandom(seed ^ 0x5bf03635);

  // Control values, read once per block by `update()`, drawn from in
  // `activate()`, and never touched by the render loop.
  let interonset = Infinity;
  let jitter = 0;
  let intermittency = 0;
  let duration = 0.06 * sampleRate;
  let durationSpread = 0;
  let position = 0;
  let spray = 0;
  let pitch = 0;
  let pitchSpread = 0;
  let reverse = 0;
  let peak = 0.5;
  let pan = 0;
  let panSpread = 0;
  let level = 1;
  let levelSpread = 0;
  let wet = 1;
  let frozen = false;
  let feedback = 0;
  let hpCoefficient = onePole(feedbackCorner(0), sampleRate);
  // `pan === 0 && panSpread === 0`, hoisted out of `activate()`.
  let centred = true;
  // Whether the two lines hold different signals, which decides the pan law.
  let stereoInput = false;

  let countdown = 0;
  let gain = WINDOW_GAIN;
  // The feedback path's state: the previous sample's wet output, the two
  // high-pass integrators, and the alternating denormal offset.
  let wetPrevL = 0;
  let wetPrevR = 0;
  let hpL = 0;
  let hpR = 0;
  let denormal = DENORMAL;
  // The freeze crossfade: samples left to fade, and the last value written
  // before the freeze, which is what the fade starts from.
  let fade = 0;
  let holdL = 0;
  let holdR = 0;

  /** Instrumentation. Read by the tests; nothing in the DSP branches on it. */
  const stats = {
    activations: 0,
    /** Onsets `intermittency` rolled away. `activations + skipped` is the
     * scheduled count, which `jitter` preserves and this one does not. */
    skipped: 0,
    dropped: 0,
    peakActive: 0,
    minDelay: Infinity,
    maxDelay: 0,
  };

  /** `params.ts` order, and it is load-bearing: the worklet unpacks it here. */
  function update(
    rate: number,
    jitter_: number,
    intermittency_: number,
    duration_: number,
    durationSpread_: number,
    position_: number,
    spray_: number,
    pitch_: number,
    pitchSpread_: number,
    reverse_: number,
    shape: number,
    pan_: number,
    panSpread_: number,
    level_: number,
    levelSpread_: number,
    freeze_: number,
    feedback_: number,
    wet_: number,
  ) {
    // One sample is the floor, so at most one grain is born per sample and the
    // scheduler needs no inner loop. 2,000 grains/s is 22 samples.
    interonset = rate > 0 ? Math.max(1, sampleRate / rate) : Infinity;
    jitter = clamp01(jitter_);
    intermittency = clamp01(intermittency_);
    // `rate: 0` is silence, and an infinite countdown is how the render loop
    // says so without a branch of its own. Otherwise a rate that has just risen
    // takes effect now rather than after the interval it was set during - which
    // is also what lets `rate` come back from 0.
    //
    // **The ceiling is the largest interval the parameters can now issue, not
    // the mean**, and that is Bencina's clause read literally: preempt when the
    // strategy's parameters are "reduced below the value previously issued by
    // `nextInteronset()`". With `jitter` up, a legitimate draw runs to
    // `2*mean`, and clamping it to `mean` at the next block boundary - this
    // function runs every 128 samples - would cap every above-mean interval and
    // raise the density by about a third. At `jitter: 0` the factor is exactly
    // 1, so this is `Math.min(countdown, interonset)` sample for sample.
    countdown =
      interonset === Infinity
        ? Infinity
        : Math.min(countdown, interonset * (1 + jitter));

    duration = Math.max(1, (duration_ / 1000) * sampleRate);
    durationSpread = clamp01(durationSpread_);
    position = clamp01(position_);
    spray = clamp01(spray_);
    pitch = pitch_;
    pitchSpread = pitchSpread_ > 0 ? pitchSpread_ : 0;
    reverse = clamp01(reverse_);
    peak = MIN_RISE + (1 - 2 * MIN_RISE) * clamp01(shape);
    pan = pan_ < -1 ? -1 : pan_ > 1 ? 1 : pan_;
    panSpread = clamp01(panSpread_);
    level = clamp01(level_);
    levelSpread = clamp01(levelSpread_);
    // The repo's `> 0` gate rule, not `>= 0.5`: it is the comparison that
    // survives `Param`'s `input * gain + offset`, so a gate driven from a
    // scaled control still opens.
    const wasFrozen = frozen;
    frozen = freeze_ > 0;
    // Only the *leaving* edge needs a fade, and the reason is asymmetric rather
    // than an oversight. Entering freeze changes no sample in the buffer and
    // leaves every grain's read index continuous, so there is nothing to splice;
    // leaving it writes new audio against the last pre-freeze sample and sends
    // that join travelling outward through the buffer, where every grain
    // eventually crosses it. `dsp.test.ts` measures both edges.
    if (wasFrozen && !frozen) fade = FADE_SAMPLES;

    feedback = feedback_ < 0 ? 0 : feedback_ > 0.95 ? 0.95 : feedback_;
    hpCoefficient = onePole(feedbackCorner(feedback), sampleRate);
    wet = clamp01(wet_);
    centred = pan === 0 && panSpread === 0;
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
   * `grainSize`, what it overwrites while the grain plays. `position` scrubs the
   * remainder, so its reach shrinks as `duration` and `pitch` rise.
   *
   * As a delay rather than an absolute index, `start` is just
   * `position*available + grainSize*ratio`, and `readHermite`'s bounds follow by
   * arithmetic rather than by luck: the delay travels linearly from there to
   * `position*available + grainSize`, inside
   * `[grainSize, bufferSize - grainSize*min(ratio, 1)]` and so inside
   * `[1, size - 4]`, because `size - 4 >= bufferSize` and `grainSize >= 1`.
   *
   * **A reversed grain needs its own arithmetic.** Its read position moves at
   * `-ratio` while the write head still moves at `+1`, so its delay *grows* by
   * `1 + ratio` where a forward grain's moves by `1 - ratio` - the heads run
   * apart rather than together, and it needs that much more room:
   *
   *     availableReverse = bufferSize - grainSize - (1 + ratio)*samples
   *     delay            = grainSize + position*availableReverse
   *
   * runs from `grainSize` up to `bufferSize - (1 + ratio)`, and stays positive
   * because the quarter-buffer clamp caps `(2 + ratio)*grainSize` at three
   * quarters of the buffer. It is written against the *rounded* length: rounding
   * up by half a sample against a step of up to 17 is eight samples of
   * overshoot, and there are only four to spare. `dsp.test.ts` asserts the whole
   * bound against an instrumented read rather than trusting this paragraph.
   */
  function activate() {
    stats.activations++;

    // The six draws happen whether or not their spreads are turned on, always in
    // this order, and even for a grain about to be dropped - so the stream is a
    // function of the activation index alone rather than of which spreads are up
    // or how full the pool is. That is what lets a test hold one parameter's
    // draws fixed while it sweeps another's.
    const uDuration = random();
    const uPitch = random();
    const uReverse = random();
    const uSpray = random();
    const uPan = random();
    const uLevel = random();

    if (freeCount === 0) {
      // **Overflow policy: no free grain, no grain.** No playing grain is
      // stolen - that would break grain integrity, the one invariant this
      // engine has - and Clouds and EC2 both drop too. The scheduler still
      // advances, so density recovers as soon as slots do.
      stats.dropped++;
      return;
    }

    // Truax's `(centre, range)` model. Both of these are total widths centred on
    // their parameter, and both are drawn *before* the clamp below, which is the
    // order the ticket requires: a grain that drew a long duration and a high
    // pitch is the one the clamp exists for.
    let grainSize = duration * (1 + durationSpread * (uDuration - 0.5));
    const ratio = Math.pow(2, (pitch + pitchSpread * (uPitch - 0.5)) / 12);
    const reversed = uReverse < reverse;

    if (ratio > 1) grainSize = Math.min(grainSize, (bufferSize * 0.25) / ratio);
    // And unconditionally, which Clouds does not need and this does: its buffer
    // is fixed where `bufferSeconds` is an option, so a short buffer with a long
    // `duration` would drive `available` negative. At the default it never bites
    // - `duration.maxValue` *is* this quarter.
    grainSize = Math.max(1, Math.min(grainSize, bufferSize * 0.25));
    const samples = Math.max(1, Math.round(grainSize));

    // `spray` reaches further back only: `position` is the near edge of the
    // cloud, not its middle - Truax's "average *or minimum* value".
    const origin = clamp01(position + spray * uSpray);

    let delay: number;
    let delayStep: number;
    if (reversed) {
      delay =
        grainSize + origin * (bufferSize - grainSize - (1 + ratio) * samples);
      delayStep = 1 + ratio;
    } else {
      delay =
        origin * (bufferSize - grainSize * ratio - grainSize) +
        grainSize * ratio;
      delayStep = 1 - ratio;
    }

    // `level` is Truax's per-grain *maximum* amplitude, so its spread is
    // one-sided: grains are drawn below it, never above.
    const grainLevel = level * (1 - levelSpread * uLevel);
    let gainL = grainLevel;
    let gainR = grainLevel;
    if (!centred) {
      // Clouds' split (`granular_sample_player.h:186-204`), which is also EC2's
      // Pan semantics: a mono source is *placed* with a constant-power law, a
      // stereo one *balanced* - panning a stereo source with a constant-power
      // law would collapse its image to a point and then move the point.
      //
      // The law is scaled by sqrt(2) so the centre is unity rather than -3 dB,
      // which is also why `centred` bypasses it: `sqrt(2)*cos(pi/4)` is
      // 1.0000000000000002, one ulp off, and a stereo control that moves every
      // sample when it is not in use is not neutral.
      const drawn = pan + panSpread * (2 * uPan - 1);
      const placed = drawn < -1 ? -1 : drawn > 1 ? 1 : drawn;
      if (stereoInput) {
        gainL = grainLevel * (placed > 0 ? 1 - placed : 1);
        gainR = grainLevel * (placed < 0 ? 1 + placed : 1);
      } else {
        const theta = (placed + 1) * (Math.PI / 4);
        gainL = grainLevel * Math.SQRT2 * Math.cos(theta);
        gainR = grainLevel * Math.SQRT2 * Math.sin(theta);
      }
    }

    const index = free[--freeCount];
    const g = grains[index];
    g.delay = delay;
    g.delayStep = delayStep;
    g.remaining = samples;
    g.phase = 0;
    g.phaseInc = 1 / samples;
    g.peak = peak;
    g.invRise = 1 / peak;
    g.invFall = 1 / (1 - peak);
    g.gainL = gainL;
    g.gainR = gainR;
    g.ratio = ratio;
    g.reversed = reversed;
    active[activeCount++] = index;

    // The delay is linear in time, so its two endpoints are its extremes.
    const end = delay + delayStep * (samples - 1);
    stats.minDelay = Math.min(stats.minDelay, delay, end);
    stats.maxDelay = Math.max(stats.maxDelay, delay, end);
    stats.peakActive = Math.max(stats.peakActive, activeCount);
    if (onGrain) onGrain(g);
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
    /**
     * Whether the two inputs are different signals. `process` cannot tell -
     * `worklet.ts` feeds a mono input to both lines - and the pan law needs to
     * know, so the caller says. Read at activation, never in the loop.
     */
    stereo = false,
  ) {
    stereoInput = stereo;
    const lineL = lines[0];
    const lineR = lines[1];
    // Hoisted, so the grain loop pays a subtraction rather than a branch.
    const advance = frozen ? 1 : 0;

    for (let i = 0; i < outL.length; i++) {
      const dryL = inL[i];
      const dryR = inR[i];

      // **Freeze is "don't call `write()`."** There is no frozen addressing
      // mode below, only a write head that stopped, which is what ticket 02's
      // moving-delay design bought: see `advance` at the grain loop.
      //
      // Feedback is therefore *inert while frozen* for free rather than by a
      // gate - the ticket's decision ("the alternative makes the freeze button
      // a lie") is what not writing already means.
      if (!frozen) {
        // The feedback path, in the house order: high-pass, then saturate,
        // then sum ahead of the dry input. Both are required rather than
        // optional, and Bencina says why: "due to the non-linear time and
        // amplitude response of the sum of active grains it may be necessary to
        // insert a compression or limiting element in the feedback loop to
        // avoid instability" - `feedback.maxValue` of 0.95 is not a loop gain
        // of 0.95, because the grain sum is not a linear gain.
        //
        // It is the *previous* sample's wet output, because `write()` has to
        // happen before the grain loop reads: a grain reads at delay >= 1, so
        // moving the write after the read would shift every grain by a sample
        // and this ticket owes bit-identity to ticket 04. One sample of loop
        // latency against a delay measured in thousands.
        //
        // Exact at `feedback: 0`: `0 * x` is +-0, the one-pole state stays at 0
        // and so contributes 0, `Math.tanh(+-0)` is +-0, and `dry + +-0` is
        // `dry`. No branch, no blend.
        const rawL = dryL + feedback * (wetPrevL + denormal);
        const rawR = dryR + feedback * (wetPrevR + denormal);
        denormal = -denormal;

        // The saturator sits on the sum that is *written*, not on the feedback
        // branch alone, so what the buffer holds is bounded rather than only
        // what is added to it - and it arrives in proportion to `feedback`,
        // which is `digital-delay`'s blend and Clouds' before it: "at
        // `feedback = 0` the line stores the input exactly, and the saturator
        // arrives in proportion to how much of a loop there actually is."
        // `Math.tanh` is `clip-amp`'s `ClipType.Tanh`, the house soft clip.
        //
        // Measured: it is what makes the loop *quieter* at its maximum than in
        // the middle - peak 3.70 at `feedback: 0.5` against 3.22 at 0.95.
        const satL = rawL + feedback * (Math.tanh(rawL) - rawL);
        const satR = rawR + feedback * (Math.tanh(rawR) - rawR);

        // The high-pass is on **everything the loop contributed** - the
        // feedback and whatever the saturator did to it - rather than on the
        // feedback branch before the saturator. A soft clip is odd, but the
        // grain sum it is fed is not symmetric over any short window, so it
        // rectifies a little DC of its own; high-passing ahead of it leaves
        // that DC to reach the buffer, and the measurement says so - it is the
        // difference between -50.83 dBFS of mean and -102.75 over 60 s at
        // `feedback: 0.95`, against -102.80 with no feedback at all.
        // Subtracting the dry input first is what keeps the
        // filter out of the dry path: at `feedback: 0` the contribution is
        // exactly 0, the state stays at 0, and `write(dry + 0)` is `write(dry)`.
        const loopL = satL - dryL;
        const loopR = satR - dryR;
        hpL += hpCoefficient * (loopL - hpL);
        hpR += hpCoefficient * (loopR - hpR);
        const injectL = dryL + (loopL - hpL);
        const injectR = dryR + (loopR - hpR);

        if (fade > 0) {
          // Leaving freeze splices the first new sample against the last one
          // written before the freeze, and that splice then travels outward
          // through the whole buffer at one sample per sample, so every grain
          // crosses it. Truax's number for exactly this: "with most material,
          // 100 samples per fade is inaudible and avoids transients."
          //
          // The fade is against the *held* last written sample rather than
          // against what the buffer already holds at that index. The buffer's
          // own content there is the ring's oldest sample, which is what the
          // splice is *against* - fading into it would replace one step with
          // two. Holding starts the join at zero difference by construction.
          const g = 0.5 - 0.5 * Math.cos(Math.PI * (1 - fade / FADE_SAMPLES));
          fade--;
          lineL.write(holdL + (injectL - holdL) * g);
          lineR.write(holdR + (injectR - holdR) * g);
        } else {
          holdL = injectL;
          holdR = injectR;
          lineL.write(holdL);
          lineR.write(holdR);
        }
      }

      // Bencina's `nextOnset` counter, with his `nextInteronset()` no longer a
      // constant:
      //
      //     if( --nextOnset == 0 ){
      //            activateGrain( sequenceStrategy.nextDuration() );
      //            nextOnset += sequenceStrategy.nextInteronset();
      //     }
      //
      // Both draws happen before either is used, and both happen whatever the
      // two parameters are set to, so the *pair* is a function of the scheduled
      // index alone - the same discipline `activate()`'s six draws follow, and
      // what makes the set of skipped onsets identical at every `jitter`.
      if (--countdown <= 0) {
        const uSkip = scheduleRandom();
        const uJitter = scheduleRandom();

        // `>=` rather than `<` on the complement, so both endpoints are exact:
        // `uSkip` is on [0, 1), so 0 never skips and 1 always does. The skip
        // returns before `activate()`, so it consumes no pool slot, renders no
        // silent grain and takes none of the six per-grain draws - EC2's
        // "computational demand varies in proportion to the number of
        // concurrently active grains rather than grains per second".
        if (uSkip >= intermittency) activate();
        else stats.skipped++;

        // Bencina's Direct Interonset Specification over Truax's mean-preserving
        // range: uniform on `[mean*(1 - jitter), mean*(1 + jitter)]`, which at
        // `jitter: 1` is his "between zero and twice the average value". The
        // mean of a uniform draw is its centre, so `rate` still means grains per
        // second - EC2's "grain density is the same whether the stream is
        // synchronous or asynchronous", and the whole reason for this form
        // rather than a one-sided one.
        //
        // One sample is the floor, as it is on `interonset` itself, so the
        // scheduler still needs no inner loop. It is inert at `jitter: 0`, where
        // the factor is exactly 1 and `interonset` is already at least 1. At the
        // top of the `rate` range it costs 0.05% of density: at 2,000 grains/s
        // the mean is 22.05 samples, so at `jitter: 1` about 2.3% of draws land
        // below one sample and are lifted to it.
        countdown += Math.max(1, interonset * (1 + jitter * (2 * uJitter - 1)));
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

        // The bound holds unconditionally rather than only while the write head
        // is moving. Live, `activate()`'s arithmetic already guarantees
        // `delay >= 1` at both endpoints and this returns `g.delay` untouched,
        // so it is bit-exact; frozen, a forward grain's delay falls all the way
        // to `origin * available` and reaches about `ratio/2` at the very last
        // sample of a grain born at `position: 0`. That is inside the grain's
        // own envelope tail, where `env` is of order 1e-5, but the module states
        // `[1, size - 4]` as an invariant and `dsp.test.ts` asserts it, so it is
        // cheaper to keep it true than to qualify it.
        const read = g.delay < 1 ? 1 : g.delay;
        sumL += lineL.readHermite(read) * env * g.gainL;
        sumR += lineR.readHermite(read) * env * g.gainR;

        // `advance` is the write head's motion, and subtracting it is the whole
        // of freeze. `delay` is the distance *behind* the head, so a grain's
        // read index moves at `advance - delayStep`; live that is `ratio`, and
        // frozen the head contributes nothing, so the delay has to fall by
        // `ratio` itself to keep the same trajectory. Forward, `delayStep - 1`
        // is `-ratio`; reversed, `(1 + ratio) - 1` is `+ratio`. One subtraction
        // covers both, the grain keeps the fields it was born with, and the read
        // index is **continuous across both freeze edges** - which is why
        // entering freeze cannot click.
        g.delay += g.delayStep - advance;
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
      // a step in level. `spray` and `pitchSpread` are what give it decorrelated
      // grains to normalise - ticket 02 measured 28.23 dB of drift across a rate
      // sweep without them and 3.30 with, and `dsp.test.ts` measures the
      // collapse.
      //
      // **`> 2` rather than `> 1` is an open question, and Clouds' answer.** The
      // clause switches the law off at exactly two grains of overlap, where two
      // decorrelated grains carry twice the power of one - +3.01 dB, which is
      // the whole of the 0.30 dB by which ticket 02 misses its own rate-sweep
      // threshold. Changing it would meet that number and depart from the
      // reference implementation, so it needs a ticket rather than a commit.
      const target =
        activeCount > 2
          ? WINDOW_GAIN / Math.sqrt(activeCount - 1)
          : WINDOW_GAIN;
      gain += GAIN_SMOOTHING * (target - gain);

      // The feedback tap is the **wet** signal - the grain sum - and not the
      // dry/wet mix. Bencina's phrase is "the output of the Delay Line
      // Granulator", which is what the granulator made; taking the mix instead
      // would inject the dry input a second time and make `wet` a feedback
      // control.
      wetPrevL = gain * sumL;
      wetPrevR = gain * sumR;

      // Exact at `wet = 0`: `dry + 0 * anything` is `dry`, sample for sample.
      outL[i] = dryL + wet * (wetPrevL - dryL);
      outR[i] = dryR + wet * (wetPrevR - dryR);
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
    wetPrevL = 0;
    wetPrevR = 0;
    hpL = 0;
    hpR = 0;
    denormal = DENORMAL;
    fade = 0;
    holdL = 0;
    holdR = 0;
    // Reseeded, not continued: a reset that left the generator where it was
    // would make two runs of the same render differ.
    random = createRandom(seed);
    scheduleRandom = createRandom(seed ^ 0x5bf03635);
    stats.activations = 0;
    stats.skipped = 0;
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
