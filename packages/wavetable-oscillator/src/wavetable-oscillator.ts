import { blampResidual4, blepResidual4 } from "./_blep";
import { createGateDetector } from "./_gate";
import { clamped, fold, MAX_SEGMENTS, walk } from "./stochastic";

type Inputs = {
  frequency: ArrayLike<number>;
  /**
   * In cents. Optional because the worklet always supplies it and a caller
   * reaching this unit directly rarely wants it; `agen()` substitutes zero once
   * per block rather than testing for it once per sample.
   */
  detune?: ArrayLike<number>;
  // `Float32Array` at a-rate, a one-element array at k-rate, and a plain
  // `number[]` from the tests: `ArrayLike` is what all three have in common.
  morph: ArrayLike<number>;
  /**
   * The hard sync gate. **Optional, and its absence is the whole of the
   * zero-latency path**: a caller with nothing to sync to - every test written
   * before this feature, and any direct user of the unit - takes the sample
   * loop exactly as it was, with no ring, no delay and no gate read. The
   * worklet always supplies it, so every worklet instance carries the two
   * samples; see the ring below for why that is unconditional rather than
   * switched on the connection.
   */
  sync?: ArrayLike<number>;
  /**
   * Radna's DSWS stage, ticket 11. **All five are optional, and their absence
   * is the whole of the bypass** - the same discipline `sync` above uses. A
   * caller with no interest in the mode, which is every test written before
   * this ticket, takes the sample loop exactly as it was: no walk, no segment
   * index, no fold. The worklet always supplies them, and there they are inert
   * at their defaults because both barriers default to 0.
   */
  segments?: ArrayLike<number>;
  pitchChaos?: ArrayLike<number>;
  pitchSpread?: ArrayLike<number>;
  ampChaos?: ArrayLike<number>;
  ampSpread?: ArrayLike<number>;
};

/**
 * The declick ramp, in samples: 64, which is 1.45 ms at 44.1 kHz and half a
 * render quantum, so a jump arriving anywhere in a block is resolved inside the
 * next one. Long enough that the ramp's own corners sit well below the click it
 * replaces, short enough not to be heard as a slide on a stepped envelope.
 */
const DECLICK = 64;
const IDECLICK = 1 / DECLICK;

/** Substituted for an absent `detune` input, once per block. */
const NO_DETUNE = [0];

/**
 * Substituted for any absent stochastic input, once per block: a closed
 * barrier and a frozen walk, which is the same thing the parameter defaults
 * say. `NO_DETUNE`'s idiom, and it is what keeps the five optional members out
 * of the sample loop as five `undefined` tests.
 */
const OFF = [0];

/**
 * Where the read position starts, as a fraction of one cycle.
 *
 * A construction option rather than an `AudioParam`, which was ticket 06 of the
 * sibling package's decision and holds here for the same reason: it is a
 * one-time initial condition, not a continuously meaningful signal. `"random"`
 * draws once per instance, which is what stops three stacked oscillators
 * beginning phase-locked and combing through their attack.
 *
 * Anything else - a number outside 0..1, a NaN, an Infinity - normalises rather
 * than reaching `offset`, where a non-finite value never comes back.
 */
function initialPhase(phase: number | "random" | undefined): number {
  if (phase === "random") return Math.random();
  if (typeof phase !== "number" || !Number.isFinite(phase)) return 0;
  return phase - Math.floor(phase);
}

/**
 * How many samples ago the sync gate crossed zero, given the previous sample
 * and this one - the age in `[0, 1)` the correction is placed at.
 *
 * `createGateDetector` says *whether* an edge happened; this is the fraction.
 * With `g- <= 0` and `g > 0` the crossing lies at `f = -g- / (g - g-)` of the
 * way from `i-1` to `i`, so it happened `1 - f` samples before sample `i`.
 * `feat/polyblep`'s arithmetic, and its two guards with it.
 *
 * The denominator is `>= g > 0` for every pair the detector reports, so it can
 * only fail to be positive if one of the samples is a NaN - which reaches here,
 * because a NaN is neither `> 0` nor `<= 0` and so leaves the detector's state
 * untouched until a real sample arrives. `rise > 0` catches it and resolves to
 * an age of 0.
 *
 * An age of **exactly 1** is the one value the residual's convention cannot
 * express - it places the discontinuity on the previous sample, whose value is
 * the one from *before* the jump - and it is the common case rather than a
 * knife edge: a gate written with `setValueAtTime` steps 0 -> 1 between two
 * samples, so `f` is 0 and the age is 1. Reading it as 0 is also the right
 * answer for that gate, since the first sample at or after the scheduled time
 * is sample `i`. The test is on the age rather than on `f` because `1 - 1e-17`
 * is 1 in binary floating point.
 */
function crossingAge(previous: number, gate: number): number {
  const rise = gate - previous;
  const raw = rise > 0 ? -previous / rise : 1;
  const fraction = raw > 0 ? (raw < 1 ? raw : 1) : 0;
  const age = 1 - fraction;
  return age < 1 ? age : 0;
}

export function WavetableOscillator(
  sampleRate: number,
  phase?: number | "random",
  /**
   * Radna 2.4's mode switch, and it defaults to the paper's own
   * recommendation. `false` fluctuates the pitch **once per wave cycle**,
   * whatever `segments` says, which "preserves the shape, and therefore
   * timbre, of a particular wavetable"; `true` fluctuates it per segment, the
   * standard DSWS behaviour, which is rougher and measurably more aliased.
   *
   * A construction option rather than an `AudioParam` for the reason `phase`
   * is one: it selects an algorithm, and an `AudioParam` would promise it can
   * be crossfaded.
   */
  pitchPerSegment?: boolean,
) {
  // Drawn once, at construction, and re-applied by every `set()` that changes
  // the table length - the only event that makes a read position meaningless.
  const phase0 = initialPhase(phase);

  let $frequency = 440;
  // The detune in cents and the ratio it produces. `Math.pow` is the expensive
  // half and the value is constant for whole seconds at a time, so it is cached
  // against the cents rather than recomputed - `polyblep-oscillator/src/dsp.ts`
  // caches it the same way, one level up.
  let $detune = 0;
  let ratio = 1;
  // The previous sample's morph position, and NaN until there is one: every
  // comparison against NaN is false, so the jump detector below cannot fire on
  // the first sample of the first block.
  let $morph = NaN;
  // The previous continuous mip level, `level + levelFrac`, and NaN until there
  // is one, for the same reason.
  let $level = NaN;
  let $wavetable = new Float32Array(0);

  const isr = 1 / sampleRate;

  let len = 0;
  // `1 / len`, because the segment index needs the phase - `offset / len`,
  // Radna Eq. 2 - once per sample and a divide is the one operation in this
  // loop that is not a multiply.
  let ilen = 0;
  let planes = 0;
  let offset = 0;
  let inc = 0;

  // The mipmap axis. `levels` is how many the loaded table carries — 1 means no
  // pyramid, which is what a table set directly rather than through the builder
  // has — `level` is the brighter member of the pair being read and `levelFrac`
  // the mix toward `level + 1`.
  let levels = 1;
  let level = 0;
  let levelFrac = 0;

  // The declick. `last` is the sample that was emitted, `held` the value a ramp
  // starts from, `ramp` how many samples of it are left. Instance state, not
  // block-local, because a jump arriving at the end of a render quantum has to
  // finish in the next one.
  let last = 0;
  let held = 0;
  let ramp = 0;

  // Whether the pitch moves inside the block, set once per block by agen(). It
  // is what decides whether the mip level is recomputed per sample and whether a
  // level jump is declicked; see updateLevel().
  let pitchARate = false;

  /*
   * Radna's DSWS stage (DAFx-23), ticket 11.
   *
   * Two deviation series, `P` and `A` in the paper's notation, one entry per
   * segment: pitch in equal-tempered semitones and amplitude as a proportion
   * of the full range (2.3). Allocated once at construction at the ceiling
   * 2.1 sets, never per cycle - the whole cost argument for the mode is that
   * the O(M) work happens once per wave cycle and the per-sample work is a
   * floor, a lookup, a lerp and a fold.
   */
  const pitchDeviation = new Float32Array(MAX_SEGMENTS);
  const ampDeviation = new Float32Array(MAX_SEGMENTS);
  // M in use this block, resolved from the k-rate `segments` parameter.
  let segments = 1;
  // The pitch deviation currently in force, as a ratio on the increment rather
  // than in semitones: it is folded into updateInc(), which is what gives the
  // deviated read rate the Nyquist clamp and the mipmap level it would not get
  // from a multiply at the read.
  let pitchMul = 1;
  // The segment whose pitch deviation `pitchMul` came from, in per-segment
  // mode. `-1` forces the next sample to apply one, which is how a fresh cycle
  // and a changed `segments` both re-arm it.
  let segment = -1;
  // Set per block: whether the stage runs at all, and whether each half of it
  // has anything to do. `walking` false is the bypass, and it is bit-exact:
  // nothing between the table read and the output is touched.
  let walking = false;
  let pitchWalks = false;
  let ampWalks = false;

  /*
   * Hard sync.
   *
   * `pending` is the output being assembled: four slots in a ring holding
   * `slot(i - 2)` through `slot(i + 1)`, which is exactly the 4-point kernel's
   * support, with `write` the index of `slot(i)`. A correction is written
   * *backwards* into samples that have been computed but not yet emitted, so
   * the output lags the input by two samples - 45.4 us at 44.1 kHz.
   *
   * **The latency is unconditional wherever `sync` is supplied at all**, which
   * in the worklet is always. Engaging the ring only when something is
   * connected was considered and rejected: a latency that changes when a cable
   * is plugged in steps the output by two samples mid-note, which is worse than
   * a constant one, and this is the same two samples
   * `polyblep-oscillator/src/dsp.ts` pays, so the library's two oscillators stay
   * aligned with each other rather than 45 us apart. A caller who passes no
   * `sync` input keeps the pre-sync path, bit for bit.
   *
   * The ring is instance state, not block-local, so a correction whose support
   * reaches past the end of a render quantum lands in the next one.
   */
  const pending = new Float64Array(4);
  let write = 0;
  const detectSync = createGateDetector();
  // Kept separately because the detector deliberately does not carry it: it
  // answers *whether* an edge happened, and the sub-sample fraction is this
  // file's own arithmetic. See crossingAge().
  let previousSync = 0;

  // `frequency` is Hz, `detune` is cents. One cycle of the table is `len` samples,
  // so a cycle per second is `len` samples of read position per second of output:
  // the increment is `frequency * 2^(detune/1200) * len / sampleRate`. `sampleRate`
  // is the worklet global and `len` arrives with the table — which is why there is
  // no `baseFrequency` parameter for a caller to get wrong, and why set() has to
  // call this too.
  //
  // The ceiling is Nyquist: one table cycle every two output samples, and it is
  // now symmetric about zero. It clamps nothing inside `frequency`'s declared
  // ±20000 at any real sample rate, so "frequency is Hz" holds across the whole
  // declared range — a lower ceiling silently mistunes the top of it.
  //
  // The comparison form rather than `Math.min`/`Math.max` is deliberate and is
  // what resolves NaN to 0: `Math.min(max, Math.max(-max, NaN))` is NaN, and one
  // NaN increment reaches `offset`, which is absorbing. NaN fails every
  // comparison here and falls through both arms to the literal 0, and so does a
  // raw of exactly 0.
  //
  // A negative increment is no longer clamped away. The read pointer simply
  // decrements and the floor-based wrap in agen() carries it round the other way,
  // which is the whole of through-zero FM in a wavetable: the sibling package
  // needed a discontinuity scheduler rewritten around a signed increment for the
  // same feature.
  //
  // `pitchMul` is ticket 11's stochastic pitch deviation, 1 unless the mode is
  // running. It is a factor here rather than a multiply at the read, and that
  // is the whole reason the deviation is band-limited at all: Radna took "no
  // further antialiasing measures" (3.1) and ticket 06's handoff expected the
  // same here, because the deviation moves the read rate *within* a cycle and
  // so does not look like a pitch change. Routed through this expression it
  // looks like exactly one: it gets the Nyquist clamp, and `updateLevel()`
  // below picks a mip level for the rate actually being read, so a segment
  // taken two octaves up reads two octaves darker.
  function updateInc(frequency: number, cents: number) {
    $frequency = frequency;
    if (cents !== $detune) {
      $detune = cents;
      ratio = Math.pow(2, cents / 1200);
    }
    const raw = frequency * ratio * pitchMul * len * isr;
    const max = len / 2;
    inc =
      raw > 0
        ? raw < max
          ? raw
          : max
        : raw < 0
          ? raw > -max
            ? raw
            : -max
          : 0;
    updateLevel();
  }

  /** Start a ramp from whatever was last emitted onto whatever comes next. */
  function declick() {
    held = last;
    ramp = DECLICK;
  }

  // The mip level from the increment.
  //
  // `inc` is the read speed in table samples per output sample, so it is also
  // the pitch in units of the table's natural frequency (`sampleRate / len`),
  // and `log2(inc)` is the octave above that pitch. That is the mipmap axis:
  // level `i` holds `len/2 / 2^i` harmonics, which is exactly Nyquist at
  // `log2(inc) === i`.
  //
  // The pair is `floor(x) + 1` and `floor(x) + 2`, not `floor(x)` and
  // `floor(x) + 1`. A linear crossfade of two levels does not produce a level
  // with an intermediate harmonic limit — it produces the *lower* level's
  // harmonic content with its top octave scaled by `1 - levelFrac` — so the
  // lower member of the pair has to be below Nyquist on its own or the fading
  // half aliases for most of the octave. Measured at 440 Hz on a 256-sample
  // sawtooth: 30.9 dB of alias SNR selecting `floor(x)`, 57.4 dB selecting
  // `floor(x) + 1`.
  //
  // Both clamps kill the fraction, so the top of the pyramid and everything
  // below the table's natural pitch are one read rather than two. `Math.log2(0)`
  // is -Infinity, which the `>= 0` comparison resolves the way updateInc()'s
  // resolves NaN.
  //
  // `Math.abs(inc)` because a mip level is about how fast the table is being
  // read, not which way: through-zero FM hands this a negative increment, and
  // `Math.log2` of one is NaN. NaN would fall through `!(i >= 0)` to level 0,
  // which is safe in the sense of finite and wrong in the sense that matters —
  // level 0 is full bandwidth, so a fast negative sweep would alias exactly as
  // hard as an unmipmapped table.
  function updateLevel() {
    const x = Math.log2(inc < 0 ? -inc : inc);
    const i = Math.floor(x) + 1;
    let next: number;
    if (!(i >= 0)) {
      level = 0;
      levelFrac = 0;
      next = 0;
    } else if (i >= levels - 1) {
      level = levels - 1;
      levelFrac = 0;
      next = level;
    } else {
      level = i;
      levelFrac = x - Math.floor(x);
      next = i + levelFrac;
    }
    // Half a level per sample is the level axis's Nyquist rate, the same
    // derivation as the morph's `0.5 / (planes - 1)` and in the same units: below
    // it the two-level read represents the movement and passes it through, above
    // it the pitch is skipping bands rather than crossing them. A mip level
    // coming into use is a table coming into use — Mohr 2005 §1 — and on a plane
    // whose energy sits above a level's limit the step across one is full scale.
    //
    // With a k-rate pitch the level moves only at block boundaries and this reads
    // as: a pitch jump of more than half an octave inside one render quantum is
    // ramped. A ±1 semitone vibrato is 0.083 of a level and a one-second
    // portamento across an octave is 0.003 of one per block; both pass through
    // untouched.
    //
    // **Suppressed when the pitch is a-rate**, which is the one place this rule
    // does not survive contact with ticket 09. `next` is a continuous function of
    // `log2|inc|`, so half a level per sample is a pitch moving by a factor of
    // √2 in one sample — not a rare event under audio-rate FM but what happens
    // every time the modulator carries the increment past the bottom of the
    // pyramid, and once it starts happening it does not stop.
    //
    // Measured on a 440 Hz carrier modulated at 200 Hz, counting how often the
    // threshold fires and how much of the second the 64-sample ramp then covers:
    // nothing at all at ±50, ±200, ±500 and ±1000 Hz of depth, and at ±3000 Hz
    // 1600 fires per 44100 samples with the ramp **running for 62.4 % of them**.
    // So ordinary vibrato, portamento and moderate FM lose nothing, and past
    // that point the declick has stopped being a declick: it is a permanent slew
    // across the sweep the caller asked for, which costs 0.85 dB of RMS
    // (−5.27 vs −6.13) and 434 Hz of spectral centroid (4748 vs 4314), with the
    // peak unchanged at 1.0963 either way. At a-rate the two-level crossfade is
    // left to represent the movement on its own, which is what it is for.
    //
    // The k-rate rule is untouched and still fires: a 110 → 7040 Hz step at a
    // block boundary measures 0.00169 through this path against 0.10784 through
    // the a-rate one, which is the 64× a 64-sample ramp is supposed to give.
    //
    // **Suppressed while ticket 11's stochastic pitch walk is running too**,
    // and this is the jump-detector question ticket 05's handoff asked ticket
    // 11 to decide - answered on the level axis rather than the morph one,
    // because the mode never touches the morph position. A pitch walk with a
    // barrier of 24 semitones crosses two octaves at a cycle boundary, which is
    // a level step of 4 against a threshold of 0.5, so left alone every large
    // deviation would retrigger the ramp and the declick would slew-limit the
    // one thing the mode exists for. Same reasoning as the a-rate case above:
    // past the threshold the ramp has stopped being a declick.
    if (!pitchARate && !pitchWalks && Math.abs(next - $level) > 0.5) declick();
    $level = next;
  }

  function set(wavetable: Float32Array, length: number, mipLevels = 1) {
    const had = len;
    $wavetable = wavetable;
    len = Math.min(length, wavetable.length);
    ilen = len > 0 ? 1 / len : 0;
    // A pyramid is `mipLevels` copies of the whole plane set, level-major, so a
    // plane is `level * planes + p` and the reader needs no second dimension. A
    // count that does not divide the data is not a pyramid — fall back to one
    // level rather than reading a plane that is not there.
    levels = Math.max(1, Math.floor(mipLevels) || 1);
    planes = Math.floor(wavetable.length / (len * levels));
    if (planes < 1) {
      levels = 1;
      planes = Math.floor(wavetable.length / len);
    }
    // The read position survives a table of the same length, so a swap mid-note
    // keeps its place in the cycle and the ramp below has less to bridge. A
    // different length makes it meaningless, and out of range for a shorter
    // table, where it reads undefined and emits NaN until it walks back — so it
    // is restated, at the phase this instance was constructed with. That is also
    // the first table's case: `had === 0`, so the very first `set()` is what puts
    // a `phase: "random"` instance where it asked to start.
    if (len !== had) offset = phase0 * len;
    // Mohr 2005 §1: a table coming into use has to be faded in, "since audible
    // clicks and spectral discontinuities would result from the sudden change of
    // wavetables". Ticket 01 zeroed the state instead, which made the step across
    // a loadWavetable knowable — the audit measured 0.7707 — but not small.
    //
    // Not on the *first* table, though. There is nothing to fade from: agen()
    // was emitting exact zeros, and a 64-sample ramp on every construction is a
    // fade-in the caller did not ask for and cannot switch off. Amp envelopes
    // own that.
    if (had !== 0) declick();
    updateInc($frequency, $detune);
    // Same rule as the fade above, on the level axis: on the *first* table there
    // is nothing to fade from, so the level the default frequency happens to
    // select must not count as a jump when the caller's first real frequency
    // arrives. NaN is the same guard `$morph` uses, and it costs one missed
    // declick — the first frequency change of a node's life, which is the caller
    // choosing a pitch rather than a note leaping away from one.
    if (had === 0) $level = NaN;
  }

  // The morph position as a plane pair and a mix, which is the whole of Serra,
  // Rubine & Dannenberg's swap discipline (JAES 38(3) 1990 §1.1) — "the change
  // occurs when the scaling factor associated with the wave table being changed
  // is zero". As `pos` crosses an integer, `pos - p0` passes through zero, `p0`
  // takes the value `p0 + 1` had, and the coefficient of the plane being
  // exchanged is exactly zero at the moment it is exchanged. Their ping-pong
  // bookkeeping (ICMC Eq. 4) is what the indexing replaces, along with the
  // sawtooth phasor and the Trigger that used to drive it.
  //
  // `m` arrives clamped to 0..1, so `p0` is in range without a second clamp, and
  // `planes === 1` collapses to `pos === 0` and a single read.
  //
  // `pf === 0` is both the sparse read and the end-of-axis guard: `pos` is at
  // most `planes - 1`, so `floor(pos) === planes - 1` can only happen when `pos`
  // is exactly that, and then there is nothing to interpolate toward.
  function readLevel(l: number, p0: number, pf: number, off: number) {
    const p = l * planes + p0;
    const y0 = interpolateLinear2d($wavetable, len, p, off);
    if (pf === 0) return y0;
    const y1 = interpolateLinear2d($wavetable, len, p + 1, off);
    return y0 + (y1 - y0) * pf;
  }

  // Phase x plane x mip level, Trausmuth & Huovilainen's PowerWave (DAFx-05
  // §2.3) three axes: "for one sample both nearest mip tables will be evaluated
  // and the real waveform value is fit according to the frequency settings of
  // the oscillator... the final value is a linear interpolation between the two
  // mip table values". Without that last crossfade a pitch sweep steps its
  // harmonic content at every octave boundary, which is the artifact that paper
  // was written to remove from the PPG Wave.
  //
  // Four table reads in the general case, and Shan et al. 2022 §5.4's cost
  // argument is that what matters is tables read per sample, not tables held:
  // two planes x two mip levels is the budget, and both axes go sparse the
  // moment their fraction is zero.
  //
  // The offset is an argument rather than the closure's, which is what hard
  // sync needs: a reset has to read the table at the position it is leaving and
  // at the one it is restarting at, both at the *current* morph position and
  // mip level, so that the step height stays right as those move.
  function readAt(m: number, off: number) {
    const pos = m * (planes - 1);
    const p0 = Math.floor(pos);
    const pf = pos - p0;
    const y0 = readLevel(level, p0, pf, off);
    if (levelFrac === 0) return y0;
    const y1 = readLevel(level + 1, p0, pf, off);
    return y0 + (y1 - y0) * levelFrac;
  }

  /**
   * The read trajectory's slope at `off`, **per output sample**, which is the
   * unit `blampResidual4` is defined against.
   *
   * A centred difference over one output sample's worth of table - `inc` table
   * samples - and not over one table sample scaled by `inc`. The two are the
   * same thing only while `|inc| <= 1`; at 2640 Hz on a 256-sample table `inc`
   * is 15.3, and the second spelling overcorrects by exactly that factor -
   * measured, it produced a peak of 4.80 on a signal bounded by 1.
   */
  function slopeAt(m: number, off: number, half: number) {
    return readAt(m, wrap(off + half)) - readAt(m, wrap(off - half));
  }

  /**
   * One step back into range whatever the overshoot, in either direction, plus
   * the one case the algebra does not cover.
   *
   * The floor-based form is load-bearing rather than tidy: through-zero FM runs
   * the pointer backwards and a sync reset can seek it backwards too. And an
   * offset that lands a hair below zero wraps to `len - e`, which rounds *up*
   * to exactly `len` in float64 once e is small enough - at `len === 256`, every
   * `offset = -2^-k` for k from 46 to 79 does it, 34 distinct values. That is an
   * index one past the last plane's end, which reads `undefined` and emits NaN
   * forever.
   */
  function wrap(off: number) {
    const wrapped = off - len * Math.floor(off / len);
    return wrapped >= len ? 0 : wrapped;
  }

  function agen(output: Float32Array, inputs: Inputs) {
    if (len === 0 || planes === 0) {
      output.fill(0);
      return;
    }

    const n = output.length;
    const frequency = inputs.frequency;
    const detune = inputs.detune ?? NO_DETUNE;
    const morph = inputs.morph;
    const sync = inputs.sync;
    // The house a-rate check, once per block and once per parameter: a connected
    // AudioParam arrives as one value per sample, an unconnected one as a single
    // value. `state-variable-filter/src/dsp.ts:103-117` is where the idiom comes
    // from; hoisting the length tests is the whole of it.
    const fRate = frequency.length === n;
    const dRate = detune.length === n;
    const mRate = morph.length === n;
    // An absent or zero-length `sync` is "not synced", and it is what skips the
    // whole path - the gate read, the ring and the two samples of latency -
    // rather than a flag tested per sample. `polyblep-oscillator/src/dsp.ts`
    // spells the same test for the same reason.
    const synced = sync !== undefined && sync.length > 0;
    const sRate = synced && sync.length === n;

    // Ticket 11's stage, engaged for this block or not.
    //
    // A barrier at 0 "reproduces the input wavetable at a constant pitch"
    // (Radna 2.3), so both barriers at 0 is the bypass and it is the default.
    // A k-rate barrier is answered on its value; an a-rate one engages the
    // stage whatever its samples say, which is the rule `sync` uses one line up
    // and is the same bargain - scanning 128 floats a block to find out would
    // cost more than the branch it saves, and a caller who connected something
    // to a barrier is asking for the path.
    //
    // The flags are latched rather than assigned, because a barrier that closes
    // only returns its deviations to zero when the walk next iterates - at a
    // cycle boundary, not at a block boundary. They are what the sample loop
    // tests, so the stage keeps running exactly long enough to release what it
    // is holding, and the boundary below is where it lets go.
    //
    // The two barriers are tested for presence rather than substituted with
    // `OFF`, and that is not symmetry with `detune` going missing: a one-element
    // stand-in has `length === n` when the block is one sample long, which the
    // block-size tests render, and the a-rate arm of the rule above would then
    // engage the stage on an input nobody supplied. The two step sizes can be
    // substituted, because their rate only decides which element to read and
    // both elements of a stand-in are the same zero.
    const pitchSpread = inputs.pitchSpread;
    const ampSpread = inputs.ampSpread;
    const pitchChaos = inputs.pitchChaos ?? OFF;
    const ampChaos = inputs.ampChaos ?? OFF;
    const psRate = pitchSpread !== undefined && pitchSpread.length === n;
    const asRate = ampSpread !== undefined && ampSpread.length === n;
    const pcRate = pitchChaos.length === n;
    const acRate = ampChaos.length === n;
    if (psRate || (pitchSpread !== undefined && pitchSpread[0] > 0))
      pitchWalks = true;
    if (asRate || (ampSpread !== undefined && ampSpread[0] > 0))
      ampWalks = true;
    walking = pitchWalks || ampWalks;
    // The one loose end of routing the deviation through updateInc(): if the
    // stage stops being engaged while `pitchMul` is off 1 - which needs a
    // caller to close the barrier and stop the read in the same breath, since
    // otherwise the next cycle boundary restores it - the increment would stay
    // bent. One test per block, not per sample.
    if (!walking && pitchMul !== 1) {
      pitchMul = 1;
      updateInc($frequency, $detune);
    }
    if (walking) {
      // M, k-rate: it is a structural choice rather than a signal, and Radna
      // 2.1 makes it "variable at runtime" rather than modulatable. The
      // comparison form resolves NaN to 1, and 0 - which is what `minValue: 0`
      // exists for, see params.ts - is one segment, the case where "the entire
      // wavetable is affected uniformly".
      const raw = inputs.segments;
      const count = raw === undefined ? 1 : Math.floor(raw[0]);
      const resolved =
        count > 1 ? (count < MAX_SEGMENTS ? count : MAX_SEGMENTS) : 1;
      if (resolved !== segments) {
        segments = resolved;
        segment = -1;
      }
    }

    // The pitch moves inside the block only if something driving it does. When
    // neither does, the increment and its mip level are computed once for the
    // whole block, exactly as they were before this ticket, and the `Math.log2`
    // and `Math.pow` never enter the sample loop.
    //
    // When one does, they are recomputed **per sample** rather than once from
    // the block's peak |inc|, which is ticket 06's open question and was settled
    // by measuring both against the same signal rendered a sample at a time —
    // at `block === 1` the two arms are by definition the same thing, so that
    // render is the ground truth. Per sample reproduces it exactly (RMS error 0
    // at any block size); the per-block level misses it by 2.3e-2, 27.5 dB below
    // the signal, and loses 110 Hz of spectral centroid because it plays the
    // whole block at the darkest level any sample in it needed.
    //
    // What disqualifies the per-block level is not the dullness, though — it is
    // that **it is a function of the block**. The same automation renders
    // differently at 128 and at 1024 frames (RMS difference 1.9e-1), which is
    // exactly what `it("does not depend on the block size")` exists to forbid.
    // A level too dark never aliases, so the per-block choice is safe in the
    // narrow sense; it is just not the same oscillator twice.
    //
    // It costs 64 % on the sample loop — 0.5574 µs/sample k-rate against 0.9152
    // per-sample a-rate, 2.5 % to 4.0 % of a 44.1 kHz realtime budget — paid
    // only by instances that actually have something connected.
    pitchARate = fRate || dRate;
    if (!pitchARate && (frequency[0] !== $frequency || detune[0] !== $detune)) {
      updateInc(frequency[0], detune[0]);
    }
    // Half a plane per sample is the plane axis's Nyquist rate, and it is the
    // line between a position that is scanning the table and a position that is
    // jumping across it. Below it the two-plane read can represent the movement
    // and has to pass it through untouched — a full-range triangle scanning a
    // `p`-plane table is admitted up to sampleRate / (4·(p−1)) Hz, which is
    // 11 kHz at two planes and 3.7 kHz at four. Above it the position is
    // skipping frames rather than crossing them, so what would arrive at the
    // output is a step whatever produced it.
    //
    // A judgement call, and recorded as one — but not the ticket's `1/(planes−1)`,
    // which is the axis's *sample* rate rather than its Nyquist rate: at
    // `planes === 2` that is the entire parameter range, so a 0→1 jump between
    // two maximally different planes would never be declicked at all.
    //
    // A position sustained above the threshold retriggers the ramp every sample,
    // which degrades to a one-pole slew with a 64-sample time constant rather
    // than to a train of clicks. `planes === 1` has no axis, so nothing is ever
    // a jump.
    const jump = planes > 1 ? 0.5 / (planes - 1) : Infinity;

    for (let i = 0; i < n; i++) {
      // Radna Eq. 1-2: the index of the segment holding this sample is
      // `floor(M * phi)` with `phi = offset / len`, and `mu` (Eq. 6) is what is
      // left over. Both halves of the stage want them, so they are computed
      // once, here, and only when the stage is running.
      let mu = 0;
      let seg = 0;
      if (walking) {
        mu = segments * offset * ilen;
        seg = Math.floor(mu);
        mu -= seg;
        // Eq. 3, per segment: the deviation of the segment being read "modulates
        // the base oscillator pitch", so the increment changes as the table is
        // read. Only in per-segment mode - 2.4's default treats the whole table
        // as one segment for pitch, which is applied at the cycle boundary
        // below. The `Math.pow` runs at most once per segment crossing, so it is
        // O(M) per cycle like the walk itself and never per sample.
        if (pitchPerSegment && seg !== segment) {
          segment = seg;
          pitchMul = Math.pow(2, pitchDeviation[seg] / 12);
          if (!pitchARate) updateInc($frequency, $detune);
        }
      }
      if (pitchARate) {
        updateInc(
          fRate ? frequency[i] : frequency[0],
          dRate ? detune[i] : detune[0],
        );
      }
      const raw = mRate ? morph[i] : morph[0];
      // The comparison form updateInc() uses, for the same reason: NaN resolves
      // to 0 rather than reaching `pos`, where it would take the block with it.
      const m = raw > 0 ? (raw < 1 ? raw : 1) : 0;
      if (Math.abs(m - $morph) > jump) declick();
      $morph = m;

      if (synced) {
        const gate = sRate ? sync[i] : sync[0];
        if (detectSync(gate) === true) {
          // Kleimola & Valimaki's two rules, in a wavetable.
          //
          // **Scale by the actual height.** A wavetable reset has no analytic
          // jump the way a sawtooth's wrap does: it is whatever the table does
          // between the phase the slave had reached at the crossing instant and
          // the phase it restarts at. Both are read here, at the live morph
          // position and mip level, so the height stays right while those move.
          //
          // **And by the actual corner.** The two trajectories have different
          // slopes as well as different values, and in a wavetable that is the
          // *common* case rather than the triangle-only exception it is in the
          // sibling package: at the classic half-integer sync ratios the step
          // height on a sawtooth table is exactly zero - the reset alternates
          // between half a cycle and none, and a sawtooth's value at half a
          // cycle equals its value at zero - so every dB of the correction is
          // the BLAMP's. Measured at 440 Hz, ratio 1.5, mipmapped: 38.65 dB
          // with the BLEP alone against 52.86 dB with both.
          const d = crossingAge(previousSync, gate);
          const start = phase0 * len;
          const from = wrap(offset - d * inc);
          const step = readAt(m, start) - readAt(m, from);
          const half = inc / 2;
          const corner = slopeAt(m, start, half) - slopeAt(m, from, half);
          // `k + d` sweeps [-2,-1], [-1,0], [0,1] and [1,2] - the 4-point
          // support, and exactly the four live slots. Two resets inside two
          // samples simply add, so there is no case analysis. `blampResidual4`
          // is even but is written in `|t|` and does not mirror a negative
          // argument, so the absolute value is load-bearing.
          for (let k = -2; k <= 1; k++) {
            const t = k + d;
            pending[(write + k + 4) & 3] +=
              step * blepResidual4(t) + corner * blampResidual4(t < 0 ? -t : t);
          }
          // The restart is at the *crossing instant*, not at this sample, so
          // the read position carries the remaining `d * inc` - forwards, or
          // backwards under through-zero FM, which the wrap already covers.
          //
          // **No declick here, deliberately.** Ticket 09's handoff asked for
          // one; measured, it is the wrong tool. A 64-sample ramp needs the
          // next edge to be more than 64 samples away, so above sampleRate/64
          // - 689 Hz at 44.1 kHz - it never completes and stops being a
          // declick: at a 1760 Hz master the peak falls from 0.96 to 0.32, a
          // 9.6 dB level loss, and the alias SNR gets *worse* (14.31 -> 14.36
          // against 46.81 for the correction) because what survives is no
          // longer a periodic waveform. The ramp keeps the two jobs it is
          // actually for, a table swap and a jumped morph position.
          offset = wrap(start + d * inc);
        }
        previousSync = gate;
      }

      let y = readAt(m, offset);
      if (ampWalks) {
        // Radna Eq. 4-6, and the reason the amplitude path needs no declick of
        // its own: the deviation applied to a sample is a linear interpolation
        // between its own segment's and the next one's - the last segment
        // wrapping to the first, Eq. 5 - so no segment boundary is ever a step.
        // Eq. 7-8's fold is what keeps the sum in range, and it is what makes
        // the stage a wavefolder; see `fold()`.
        //
        // **After the plane crossfade and before the declick ramp.** After,
        // because the deviation is defined on the output sample and not on one
        // plane of it; before, because a ramp started by a table swap or a
        // jumped morph position has to land on the signal that is actually
        // being emitted.
        const next = seg + 1 < segments ? seg + 1 : 0;
        const a = ampDeviation[seg];
        y = fold(y + a + (ampDeviation[next] - a) * mu);
      }
      if (ramp > 0) {
        ramp--;
        // Hold the pre-jump output and ramp linearly onto the live signal. The
        // jump's own contribution to any one sample step is |held − y| / DECLICK;
        // what is left is the waveform's own slope, which it was going to have
        // anyway.
        y = held + (y - held) * ((DECLICK - ramp) * IDECLICK);
      }
      if (synced) {
        // `slot(i - 2)` is complete: everything whose support reaches it has
        // been written. Emit it and hand the freed slot forward as
        // `slot(i + 2)`. In a four-slot ring `(write + 2) & 3` is both.
        pending[write] += y;
        output[i] = pending[(write + 2) & 3];
        pending[(write + 2) & 3] = 0;
        write = (write + 1) & 3;
      } else {
        output[i] = y;
      }
      // Read back rather than reusing `y`: `held` has to be the value that was
      // actually emitted, and the write through a Float32Array rounds it.
      last = output[i];

      // `len` is at least 1 here because agen() returns early on len === 0.
      const advanced = offset + inc;
      // The wave cycle boundary, and the only place the walks iterate (Radna
      // 2.3: "iterated every wave cycle"). Ticket 01 made the wrap the single
      // well-defined place the read position turns over, and this is it, read
      // in both directions because through-zero FM runs the pointer backwards
      // and a cycle counted backwards is still a cycle.
      if (walking && (advanced >= len || advanced < 0)) {
        // The four parameters are read *here*, once per cycle, rather than once
        // per sample. That is not an economy, it is the rate the algorithm runs
        // at: the walk is a per-cycle process, and sampling its step size
        // faster would not make it move faster. Declared a-rate all the same,
        // so the value taken is the one at the boundary's own sample rather
        // than the one at the top of the block.
        //
        // Both barriers are clamped with the house comparison form, so a NaN
        // arriving from a direct caller resolves to a closed barrier rather
        // than poisoning a walk that has no way back out.
        const pb = pitchWalks
          ? clamped(psRate ? pitchSpread![i] : pitchSpread![0], 24)
          : 0;
        const ab = ampWalks
          ? clamped(asRate ? ampSpread![i] : ampSpread![0], 1)
          : 0;
        // "The step size scales the random value" (2.3). Ours scales it as a
        // *fraction of the barrier*, so the two knobs are independent: the
        // barrier says how far the deviation can get from centre and the chaos
        // says how much of that it may cross in one cycle. A chaos of 0 with a
        // barrier open is a legal, frozen walk.
        const pc = clamped(pcRate ? pitchChaos[i] : pitchChaos[0], 1);
        const ac = clamped(acRate ? ampChaos[i] : ampChaos[0], 1);
        walk(pitchDeviation, segments, pb * pc, pb);
        walk(ampDeviation, segments, ab * ac, ab);
        // A closed barrier reflects every deviation to exactly 0, so this is
        // where the stage releases: one cycle after the caller closes it, the
        // flags go false and the loop is back to the bypass, bit for bit.
        pitchWalks = pb !== 0;
        ampWalks = ab !== 0;
        walking = pitchWalks || ampWalks;
        // Radna 2.4, and the default: "we can treat the entire wavetable as a
        // single segment for the purpose of pitch fluctuation, regardless of
        // the number of segments used for amplitude fluctuation. In this case,
        // the pitch fluctuation occurs once per cycle". One `Math.pow` per
        // cycle, and `pitchDeviation[0]` is exactly 0 once the barrier closes,
        // so this is also what puts the increment back.
        if (!pitchPerSegment) {
          pitchMul = Math.pow(2, pitchDeviation[0] / 12);
          updateInc($frequency, $detune);
        }
        segment = -1;
      }
      offset = wrap(advanced);
    }
  }

  return { agen, set };
}

/**
 * Linear interpolation for a 2d buffer
 */
function interpolateLinear2d(
  buffer: Float32Array,
  len: number,
  plane: number,
  offset: number,
) {
  const index = Math.floor(offset);
  const frac = offset - index;
  const next = (index + 1) % len;
  const y1 = buffer[plane * len + index];
  const y2 = buffer[plane * len + next];
  const y = y1 + (y2 - y1) * frac;
  return y;
}
