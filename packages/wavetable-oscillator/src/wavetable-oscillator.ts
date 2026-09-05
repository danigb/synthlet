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
  let $wavetable = new Float32Array(0);

  const isr = 1 / sampleRate;

  let len = 0;
  let planes = 0;
  let offset = 0;
  let inc = 0;

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
  }

  /** Start a ramp from whatever was last emitted onto whatever comes next. */
  function declick() {
    held = last;
    ramp = DECLICK;
  }

  function read(inputs: Inputs) {
    if (inputs.frequency[0] !== $frequency) {
      $frequency = inputs.frequency[0];
      updateInc();
    }
  }

  function set(wavetable: Float32Array, length: number) {
    const had = len;
    $wavetable = wavetable;
    len = Math.min(length, wavetable.length);
    planes = Math.floor(wavetable.length / len);
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
  // Ticket 06's mip level is a third interpolation axis inside this function,
  // which is why it is a function and not four lines inlined in the loop.
  function readPlanes(m: number) {
    const pos = m * (planes - 1);
    const p0 = Math.floor(pos);
    const y0 = interpolateLinear2d($wavetable, len, p0, offset);
    if (p0 >= planes - 1) return y0;
    const y1 = interpolateLinear2d($wavetable, len, p0 + 1, offset);
    return y0 + (y1 - y0) * (pos - p0);
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
