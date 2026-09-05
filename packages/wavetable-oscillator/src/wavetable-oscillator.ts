type Inputs = {
  frequency: ArrayLike<number>;
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

export function WavetableOscillator(sampleRate: number) {
  let $frequency = 440;
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

  // `frequency` is Hz. One cycle of the table is `len` samples, so a cycle per
  // second is `len` samples of read position per second of output: the increment
  // is `frequency * len / sampleRate`. Both of those live in here — `sampleRate` is
  // the worklet global, `len` arrives with the table — which is why there is no
  // `baseFrequency` parameter for a caller to get wrong, and why set() has to call
  // this too.
  //
  // The ceiling is Nyquist: one table cycle every two output samples. It clamps
  // nothing inside `frequency`'s declared 0..20000 at any real sample rate, so
  // "frequency is Hz" holds across the whole declared range — a lower ceiling
  // silently mistunes the top of it. The comparison form is what resolves NaN to 0
  // rather than letting it into `offset`, where it never comes back; the divide
  // that used to make Infinity reachable went with the parameter. The `> 0` half
  // freezes the phase on a negative frequency, matching minValue 0, and ticket 09's
  // through-zero FM is what lifts it.
  function updateInc() {
    const raw = $frequency * len * isr;
    const max = len / 2;
    inc = raw > 0 ? (raw < max ? raw : max) : 0;
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
  function updateLevel() {
    const x = Math.log2(inc);
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
    // `frequency` is k-rate, so the level moves only at block boundaries and this
    // reads as: a pitch jump of more than half an octave inside one render
    // quantum is ramped. A ±1 semitone vibrato is 0.083 of a level and a
    // one-second portamento across an octave is 0.003 of one per block; both pass
    // through untouched. Ticket 09's a-rate frequency applies the same rule per
    // sample with no change of form.
    if (Math.abs(next - $level) > 0.5) declick();
    $level = next;
  }

  function read(inputs: Inputs) {
    if (inputs.frequency[0] !== $frequency) {
      $frequency = inputs.frequency[0];
      updateInc();
    }
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
    // table, where it reads undefined and emits NaN until it walks back.
    if (len !== had) offset = 0;
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
    updateInc();
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

    read(inputs);
    const morph = inputs.morph;
    // The house a-rate check, once per block: a connected AudioParam arrives as
    // one value per sample, an unconnected one as a single value.
    const aRate = morph.length === output.length;
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

    for (let i = 0; i < output.length; i++) {
      const raw = aRate ? morph[i] : morph[0];
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
      // One step back into range whatever the overshoot; `len` is at least 1 here
      // because agen() returns early on len === 0.
      offset -= len * Math.floor(offset / len);
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
