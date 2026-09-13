/**
 * Sample-rate and bit-depth reduction, with no Web Audio anywhere near it.
 *
 * This is Synth Secrets Part 17 as a module. Reid opens that chapter by
 * *returning to Part 16*: an analogue-to-digital converter is a sample-and-hold
 * clocked fast, and a quantiser deciding which of a finite set of levels each
 * held voltage belongs to. So the engine here is
 * `@synthlet/sample-hold`'s latch driven by an internal phase accumulator
 * instead of a trigger, followed by Reid's Table 1.
 *
 * ```
 * in -> [antialias LP] -> hold -> quantise -> [reconstruct LP] -> out
 * ```
 *
 * **The two filters are switches, and that is the whole point.** Part 17 makes
 * three claims, each with a figure, and two of them are claims about what the
 * filters do:
 *
 * 1. Sampling below twice the bandwidth aliases - Figures 17 and 18, the 10 kHz
 *    sine reappearing at 3.33 kHz and at 1.11 kHz.
 * 2. *"You can't remove aliasing once it has been introduced, so we have to
 *    ensure that it never occurs... by sticking a low-pass filter in the signal
 *    path."* That is `antialias`, and with it on the 3.33 kHz tone is gone.
 * 3. The samples are not the sound. That is `reconstruct`, and with it on a
 *    held staircase is a sine again - the answer to the *"audio stored
 *    digitally sounds horrible because it's a series of steps"* paragraph.
 *
 * A module with the filters baked in could not make any of those three points.
 * Both default to **off**, because the module's own sound is what the lesson is
 * about and what you should hear first.
 */

/**
 * Bit depth at and above which the quantiser is skipped entirely.
 *
 * `Float32` audio carries about 24 bits of mantissa, so `round(x * 2^23) / 2^23`
 * is at or below the resolution of the block it is written to: the quantiser
 * would be arithmetic with no observable effect. Skipping it is what makes the
 * default a bit-exact wire.
 */
export const TRANSPARENT_BITS = 24;

/**
 * Corner of both filters, as a fraction of the reduced sample rate.
 *
 * Just under the reduced Nyquist of 0.5. Lower would take more of the band the
 * user asked to keep; higher would leave the filter still passing at the fold
 * point, where it has nothing left to attenuate.
 */
export const CORNER_RATIO = 0.45;

/**
 * Section Qs of an 8th-order Butterworth lowpass, as four cascaded biquads:
 * `1 / (2 cos((2k+1) pi / 16))` for k = 0..3, which is the standard pole-Q
 * table for an even-order Butterworth split into second-order sections.
 *
 * **Not four identical Q = 0.7071 sections.** Those would also be 48 dB/octave
 * asymptotically, and they would also be called "four cascaded Butterworth
 * biquads" - but each one is -3 dB at the corner, so the cascade is -12 dB
 * there and droops well below it. The true 8th-order alignment is maximally
 * flat and -3 dB at the corner exactly, which is what a *reconstruction* filter
 * has to be: the test asserts that reconstructing a 1 kHz sine returns its RMS
 * to within a dB, and a filter 12 dB down at 9.9 kHz would still pass that
 * while quietly costing a real amount of treble on anything else.
 *
 * Four sections rather than two because the lesson's own numbers demand it. At
 * `rate: 13333` the corner is 6 kHz and the 10 kHz input sits 1.67x above it; a
 * 24 dB/octave filter takes about 14 dB off, which leaves an alias you can
 * still see on the spectrum. This cascade takes 44.5 dB off at 44.1 kHz
 * (measured), which is what makes `antialias: 1` look like the claim it is
 * illustrating.
 */
export const BUTTERWORTH_Q = [0, 1, 2, 3].map(
  (k) => 1 / (2 * Math.cos(((2 * k + 1) * Math.PI) / 16)),
);

/** Second-order sections per cascade. */
const SECTIONS = BUTTERWORTH_Q.length;

/** State variables per section, and per cascade, and per channel. */
const STATE_PER_SECTION = 2;
const STATE_PER_CASCADE = SECTIONS * STATE_PER_SECTION;
/** Two cascades: the anti-alias filter and the reconstruction filter. */
const STATE_PER_CHANNEL = 2 * STATE_PER_CASCADE;

/** Channels of state allocated up front, as `ring-mod` and `level-meter` do. */
const INITIAL_CHANNELS = 16;

/**
 * Magnitude below which a biquad's state is flushed to zero.
 *
 * A cascade decaying towards zero eventually runs entirely in denormals -
 * measured, the reconstruction filter's state reaches `5e-324` a second after
 * the signal stops - and a filter that never stops running never recovers from
 * that.
 *
 * The rest of the library answers this by injecting an alternating
 * `DENORMAL = 1e-20` into the signal path (`digital-delay`, `chorus`,
 * `analog-delay`). **That answer is wrong here**, and the reason is a
 * requirement rather than a preference: this module has to be *silent* on
 * silence, and a +/-1e-20 injection is not silence - it is a tone at Nyquist
 * 400 dB down, which is still not zero. Flushing the state instead costs two
 * comparisons per section that short-circuit on the first for any real signal,
 * leaves the filter response unchanged to 0.04 dB, and puts exact zeros out of
 * an exactly-zero input.
 */
const FLUSH = 1e-30;

/**
 * Direct-form-II-transposed biquad coefficients, as `AudioParam`-free numbers.
 *
 * One flat array per cascade rather than an array of objects: the whole point
 * of the cache is that a block with the filters on touches no allocation and no
 * property lookup per sample.
 */
type Coefficients = Float64Array;

/**
 * RBJ lowpass coefficients for one section, normalised by `a0` and appended to
 * `into` as `b0, b1, b2, a1, a2`.
 *
 * @see https://www.w3.org/TR/audio-eq-cookbook/
 */
function lowpassSection(
  into: Coefficients,
  at: number,
  frequency: number,
  sampleRate: number,
  Q: number,
) {
  const w0 = (2 * Math.PI * frequency) / sampleRate;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * Q);
  const a0 = 1 + alpha;

  into[at] = (1 - cos) / 2 / a0;
  into[at + 1] = (1 - cos) / a0;
  into[at + 2] = (1 - cos) / 2 / a0;
  into[at + 3] = (-2 * cos) / a0;
  into[at + 4] = (1 - alpha) / a0;
}

/**
 * The 8th-order Butterworth lowpass at `frequency`, as four sections.
 *
 * Derived from `sampleRate` rather than hardcoded, so 44.1 and 48 kHz filter
 * the same *corner* rather than the same number of radians - which is what
 * makes the alias and image frequencies below identical at both rates.
 */
export function butterworthLowpass(
  frequency: number,
  sampleRate: number,
): Coefficients {
  const coefficients = new Float64Array(SECTIONS * 5);
  for (let s = 0; s < SECTIONS; s++) {
    lowpassSection(
      coefficients,
      s * 5,
      frequency,
      sampleRate,
      BUTTERWORTH_Q[s],
    );
  }
  return coefficients;
}

export type DecimatorParamInputs = {
  rate: ArrayLike<number>;
  bits: ArrayLike<number>;
  antialias: ArrayLike<number>;
  reconstruct: ArrayLike<number>;
};

/**
 * A decimator over as many channels as it is given.
 *
 * **One phase accumulator, shared by every channel.** A stereo ADC has one
 * clock, so both channels are latched on the same sample - which is a property
 * the tests assert rather than assume, because a per-channel accumulator would
 * sound almost right and would decorrelate a stereo image for no reason.
 * The held values and the filter states are per channel.
 *
 * `rate` is a free-running clock at whatever frequency it is given, and the
 * ratio to the host's rate is generally not an integer: `13333 / 44100` puts
 * the hold period between three and four samples. That one-sample jitter is a
 * real artifact of a real clock and shows up as low-level sidebands. Snapping
 * `rate` to integer divisors would remove it, and would also make the slider
 * jump and put the book's own numbers - 13.33 kHz, 11.11 kHz - out of reach.
 */
export function createDecimator(sampleRate: number) {
  // Cached against the rate they were derived from, `adsr`'s `_updateAdsr`
  // pattern: eight biquads' coefficients are eight `sin`, eight `cos` and
  // forty divisions, and `rate` is k-rate precisely so that this happens once
  // per change rather than once per sample.
  let $rate = -1;
  let coefficients = butterworthLowpass(CORNER_RATIO * sampleRate, sampleRate);
  let increment = 1;
  let holding = false;

  // Shared by every channel: one converter, one clock.
  //
  // Starting at 1 rather than 0 so that the *first* sample is the first thing
  // latched. Tested before the increment rather than after it for the same
  // reason: increment-then-test emits the initial `held` - a zero - until the
  // first wrap, and at `rate = sampleRate / 2` it also lands the latches on an
  // irregular 1-2-2 pattern instead of holding every pair.
  let phase = 1;

  let held = new Float64Array(INITIAL_CHANNELS);
  let state = new Float64Array(INITIAL_CHANNELS * STATE_PER_CHANNEL);

  return function decimate(
    inputs: Float32Array[],
    outputs: Float32Array[],
    params: DecimatorParamInputs,
  ) {
    _update(params.rate[0]);

    const bits = params.bits[0];
    // Skipped rather than computed at 24: `round(x * 2^23) / 2^23` is at the
    // resolution of the Float32 block it would be written to, so the branch is
    // what makes the default an exact wire rather than a very good copy.
    const quantising = bits < TRANSPARENT_BITS;
    const q = quantising ? Math.pow(2, bits - 1) : 0;

    const antialias = params.antialias[0] > 0;
    const reconstruct = params.reconstruct[0] > 0;

    const channels = inputs.length;
    if (channels === 0) return;

    // Growing is an allocation, but only when the channel count changes -
    // never per block. 16 covers everything a browser routes by default.
    if (channels > held.length) {
      const grownHeld = new Float64Array(channels);
      grownHeld.set(held);
      held = grownHeld;
      const grownState = new Float64Array(channels * STATE_PER_CHANNEL);
      grownState.set(state);
      state = grownState;
    }

    // The hold advances once per *frame* and the filters run per channel, so
    // the phase has to be restored for each channel and committed once. Every
    // channel sees the same clock; reading `phase` back out of the last
    // channel would be the same thing, but only by accident of the loop order.
    const startPhase = phase;
    let endPhase = phase;

    for (let c = 0; c < channels && c < outputs.length; c++) {
      const input = inputs[c];
      const output = outputs[c];
      const frames = input.length;
      const base = c * STATE_PER_CHANNEL;

      let p = startPhase;
      let h = held[c];

      for (let i = 0; i < frames; i++) {
        let x = input[i];

        // Before the hold: the anti-alias filter, which is claim 2. It has to
        // run before the sampler, because "you can't remove aliasing once it
        // has been introduced" is the reason the filter exists.
        if (antialias) x = _section(base, x);

        if (holding) {
          if (p >= 1) {
            p -= 1;
            h = x;
          }
          x = h;
          p += increment;
        } else {
          // Kept in step so that lowering `rate` back below the host's
          // resumes from the current sample rather than from a stale one.
          h = x;
        }

        // Reid's Table 1: a 6-bit converter is 64 bands, each with one code.
        // Mid-tread - zero is a level rather than a band edge - so silence
        // stays silence, which matters more than the arithmetic nit that this
        // gives 2^bits + 1 codes rather than 2^bits. At `bits: 1` that is the
        // three levels -1, 0 and 1; at `bits: 6` it is 65 rather than 64. The
        // alternative, clamping the code to [-2^(bits-1), 2^(bits-1) - 1] the
        // way two's complement does, buys Reid's 64 exactly and costs a
        // half-band error at full scale on the positive peak.
        //
        // `bits` is continuous, so a fractional value is a fractional `q` and
        // a slider from 24 down to 2 is a smooth crush rather than 22 steps.
        if (quantising) x = Math.round(x * q) / q;

        // After the quantiser: the reconstruction filter, which is claim 3.
        if (reconstruct) x = _section(base + STATE_PER_CASCADE, x);

        output[i] = x;
      }

      held[c] = h;
      endPhase = p;
    }

    phase = endPhase;
  };

  /**
   * One four-section cascade over one sample, in transposed direct form II.
   *
   * Inlined into the sample loop by shape rather than by hand: `base` selects
   * which of the two cascades' state to walk, and both share one coefficient
   * array because both filters are the same filter.
   */
  function _section(base: number, input: number) {
    let y = input;
    for (let s = 0; s < SECTIONS; s++) {
      const k = s * 5;
      const at = base + s * STATE_PER_SECTION;
      const s1 = state[at];
      const s2 = state[at + 1];

      const out = coefficients[k] * y + s1;
      let n1 = coefficients[k + 1] * y - coefficients[k + 3] * out + s2;
      let n2 = coefficients[k + 2] * y - coefficients[k + 4] * out;

      // See `FLUSH`. The first comparison is false for any real signal, so
      // this costs one test per section on anything that is not a tail.
      if (n1 > -FLUSH && n1 < FLUSH && n2 > -FLUSH && n2 < FLUSH) {
        n1 = 0;
        n2 = 0;
      }

      state[at] = n1;
      state[at + 1] = n2;
      y = out;
    }
    return y;
  }

  function _update(rate: number) {
    if ($rate === rate) return;
    $rate = rate;

    // Clamped to the host's rate, because a descriptor cannot read the
    // context: the default is 44100, which is a bypass at 44.1 kHz and a
    // 44.1 kHz hold at 48 kHz. Both READMEs say so.
    const effective = rate < sampleRate ? rate : sampleRate;
    holding = rate < sampleRate;
    increment = effective / sampleRate;

    // The corner tracks the *effective* rate, so it is the same number the
    // hold uses and can never exceed 0.45 x sampleRate - which it would at
    // `rate: 192000` on a 44.1 kHz context, asking a biquad for a corner above
    // Nyquist.
    coefficients = butterworthLowpass(CORNER_RATIO * effective, sampleRate);
  }
}
