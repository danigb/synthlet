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

export function WavetableOscillator(
  sampleRate: number,
  phase?: number | "random",
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
  function updateInc(frequency: number, cents: number) {
    $frequency = frequency;
    if (cents !== $detune) {
      $detune = cents;
      ratio = Math.pow(2, cents / 1200);
    }
    const raw = frequency * ratio * len * isr;
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
    if (!pitchARate && Math.abs(next - $level) > 0.5) declick();
    $level = next;
  }

  function set(wavetable: Float32Array, length: number, mipLevels = 1) {
    const had = len;
    $wavetable = wavetable;
    len = Math.min(length, wavetable.length);
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
  function readLevel(l: number, p0: number, pf: number) {
    const p = l * planes + p0;
    const y0 = interpolateLinear2d($wavetable, len, p, offset);
    if (pf === 0) return y0;
    const y1 = interpolateLinear2d($wavetable, len, p + 1, offset);
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
  function readPlanes(m: number) {
    const pos = m * (planes - 1);
    const p0 = Math.floor(pos);
    const pf = pos - p0;
    const y0 = readLevel(level, p0, pf);
    if (levelFrac === 0) return y0;
    const y1 = readLevel(level + 1, p0, pf);
    return y0 + (y1 - y0) * levelFrac;
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
    // The house a-rate check, once per block and once per parameter: a connected
    // AudioParam arrives as one value per sample, an unconnected one as a single
    // value. `state-variable-filter/src/dsp.ts:103-117` is where the idiom comes
    // from; hoisting the length tests is the whole of it.
    const fRate = frequency.length === n;
    const dRate = detune.length === n;
    const mRate = morph.length === n;

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

      let y = readPlanes(m);
      if (ramp > 0) {
        ramp--;
        // Hold the pre-jump output and ramp linearly onto the live signal. The
        // jump's own contribution to any one sample step is |held − y| / DECLICK;
        // what is left is the waveform's own slope, which it was going to have
        // anyway.
        y = held + (y - held) * ((DECLICK - ramp) * IDECLICK);
      }
      output[i] = y;
      // Read back rather than reusing `y`: `held` has to be the value that was
      // actually emitted, and the write through a Float32Array rounds it.
      last = output[i];

      offset += inc;
      // One step back into range whatever the overshoot, in either direction;
      // `len` is at least 1 here because agen() returns early on len === 0.
      //
      // The floor-based form is load-bearing now rather than merely tidy. Ticket
      // 01 replaced a pair of one-sided `if`s with it and the `offset < 0` half
      // was unreachable, because the increment was clamped at zero; through-zero
      // FM is what makes the pointer run backwards, and this line is the whole of
      // the wrap it needs.
      offset -= len * Math.floor(offset / len);
      // And the one case the algebra does not cover. An `offset + inc` that lands
      // a hair below zero wraps to `len - ε`, which rounds *up* to exactly `len`
      // in float64 once ε is small enough — at `len === 256`, every
      // `offset = -2^-k` for k from 46 to 79 does it, 34 distinct values. That is
      // an index one past the last plane's end, which reads `undefined` and emits
      // NaN forever. Only reachable with a negative increment, so it arrives with
      // this ticket.
      if (offset >= len) offset = 0;
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
