export enum SvfType {
  ByPass = 0,
  LowPass = 1,
  BandPass = 2,
  HighPass = 3,
  Notch = 4,
  Peak = 5,
  AllPass = 6,
  // Not implemented yet
  // LowShelf = 7,
  // HighShelf = 8,
}

export type Filter = () => void;

// Where the prewarping curve stops following the tangent, as a fraction of
// Nyquist. **This number is ours, not Zavalishin's.** He works at "some point
// around 16kHz" at a 44.1 kHz sample rate and gives no numeric prescription
// beyond the observation that the detuning "is getting particularly bad at
// cutoffs above 16kHz" (Fig. 3.18). A fixed 16 kHz would clip the top octave at
// 96 kHz and mean nothing at 8 kHz. 0.72 of Nyquist is 15876 Hz at 44.1 kHz -
// his figure to within 0.8% - and it scales with the sample rate.
const CEILING_AS_A_FRACTION_OF_NYQUIST = 0.72;

/**
 * The integrator gain `g` for a cutoff in Hz: continuous-speed bounded cutoff
 * prewarping, Zavalishin, *The Art of VA Filter Design* (2018) section 3.8,
 * eq. 3.23 and the derivative given on p.70.
 *
 * Plain prewarping is `g = tan(pi*f/fs)`, which has a pole at Nyquist. Above it
 * `g` goes negative, the poles leave the unit circle and the filter diverges -
 * and `frequency.maxValue` is a compile-time 20000 while Nyquist is not, so at
 * any sample rate below 40 kHz the parameter's own declared maximum is past the
 * pole. Zavalishin's bounded prewarping (eq. 3.21-3.22) fixes the prewarping
 * point at a ceiling and "becomes able to specify the cutoffs beyond Nyquist".
 *
 * It is the *continuous-speed* variant that is taken here rather than eq. 3.22,
 * because eq. 3.22 has a breakpoint and he says exactly what that costs: the
 * motion of the prewarping point makes its own contribution to the rate of
 * change of the cutoff, and it "suddenly disappears", giving "a sudden change
 * of the perceived modulation speed as the cutoff traverses through the
 * prewarping breakpoint". A package whose README connects an LFO to `frequency`
 * cannot afford a kink in the middle of a sweep. So the curve is continued as a
 * tangent line:
 *
 *     g(t) = tan(t)                                    for t <= tmax
 *     g(t) = tan(tmax) + (t - tmax) * (1 + tan^2 tmax) for t >  tmax
 *
 * where `t = pi*f/fs` is the half-angle `omega*T/2`. Both constants are hoisted,
 * so above the ceiling this is cheaper than the tangent it replaces.
 *
 * Written as a free function on purpose: `virtual-analog-filter` has the same
 * class of bug, worse (`processor.ts:65` folds +/-127 semitones of detune into
 * the cutoff unclamped), and when it gets its own ticket this moves to
 * `scripts/` unchanged.
 */
export function createPrewarp(sampleRate: number) {
  const invSr = 1 / sampleRate;
  // Independent of the sample rate, which is what makes the ceiling one
  // constant rather than a table: t = pi*f/fs and f = fraction * fs/2.
  const tMax = (CEILING_AS_A_FRACTION_OF_NYQUIST * Math.PI) / 2;
  const gMax = Math.tan(tMax);
  const speed = 1 + gMax * gMax; // mu'(omega_max), Zavalishin p.70

  return function prewarp(frequency: number) {
    const t = frequency * invSr * Math.PI;
    return t <= tMax ? Math.tan(t) : gMax + (t - tMax) * speed;
  };
}

// Ported from SvfLinearTrapOptimised2.hpp in FredAntonCorvest/Common-DSP,
// MIT licensed, Copyright (c) 2016 Fred Anton Corvest (FAC).
// https://github.com/FredAntonCorvest/Common-DSP/blob/master/Filter/SvfLinearTrapOptimised2.hpp
//
// The algorithm is Andrew Simper (Cytomic), "Solving the continuous SVF
// equations using trapezoidal integration and equivalent currents".
// https://www.cytomic.com/files/dsp/SvfLinearTrapOptimised2.pdf
//
// See THIRD-PARTY-LICENSES.md at the repository root.
export function createFilter(sampleRate: number) {
  const prewarp = createPrewarp(sampleRate);

  // coefficients
  let _a1 = 0,
    _a2 = 0,
    _a3 = 0,
    _m0 = 0,
    _m1 = 0,
    _m2 = 0;
  let _ic1eq = 0,
    _ic2eq = 0,
    _v1 = 0,
    _v2 = 0,
    _v3 = 0;

  // damping, 1/Q: set by the mixing half and read by the cutoff half
  let _k = 0;
  // whether the current `type`'s mix contains `k`, and so has to be recomputed
  // when Q moves
  let _mixReadsK = false;

  // previous type, Q and frequency
  let currType = -1;
  let currQ = 0;
  let currFreq = 0;

  // The output mix. It depends on `type` and on `k`, and on nothing else -
  // read the switch below: no arm of it mentions `freq` or `g`. Both are
  // k-rate, so this runs once a block, where it used to run once a sample.
  //
  // **Measured, and it is worth much less than it looks.** 200k blocks of 128
  // samples at 48 kHz, minimum of seven timed runs across three or more
  // processes, on Node 24 / Apple Silicon:
  //
  //   neither parameter automated       448 ms   0.084% of a core
  //   a-rate cutoff, switch per sample  1121 ms  0.210% of a core
  //   a-rate cutoff, mix hoisted        1094 ms  0.205% of a core   -2.3%
  //   a-rate cutoff and Q, lowpass      1390 ms  0.261% of a core   +30%
  //   a-rate cutoff and Q, highpass     1467 ms  0.275% of a core   +37%
  //
  // The audit predicted 31% for hoisting the mix and 4.6% for a-rate Q; here
  // it is 2.3% and 30%, in both cases because the cost is arithmetic and not
  // control flow. A per-sample `Q` adds a second division - `1/max(q, 1e-4)`
  // here and `1/(1 + g*(g+k))` in `updateCutoff` - and a division is most of
  // what a sample of this filter costs. An unmodulated filter pays none of it.
  //
  // The audit predicted 31% from the same split and it does not reproduce here:
  // the per-sample cost is the tangent and the division in `a1`, and a
  // seven-arm switch over three stores is a rounding error beside them. The
  // number is kept because the folder's rule is that a performance claim
  // carries its measurement, and this one measures small.
  //
  // The split is taken anyway, on structure rather than on speed: nothing in
  // the sample loop reads `type` any more, and threading `k` through per sample
  // for ticket 06 is a change to one function instead of to the loop.
  //
  // Range [0, 6] for `type` and [0.025, 40] for `q`, the compile-time
  // constants in `params.ts`; that is all `AudioParam` clamps to.
  function updateMixing(type: number, q: number) {
    if (type === currType && q === currQ) return;
    const typeChanged = type !== currType;
    currType = type;
    currQ = q;
    _k = 1 / Math.max(q, 0.0001);
    // `a1` reads `k`, so the two halves are not independent: a change in `q`
    // has to invalidate the cutoff coefficients even when the cutoff itself
    // has not moved. `NaN` compares false against every frequency, so the next
    // `updateCutoff` cannot short-circuit. (A change in `type` alone
    // recomputes them to the same values, which is what the single `update()`
    // this replaces did as well.)
    currFreq = NaN;

    // Only four of the seven responses put `k` in the mix. When `Q` is
    // automated this runs every sample, and for `LowPass`, `BandPass` and
    // `ByPass` a moving Q leaves m0..m2 exactly where they were, so the switch
    // is skipped rather than re-executed to reassign three constants.
    // `_mixReadsK` was set the last time `type` changed, which is the only
    // time it can change.
    //
    // **It measures at zero**: 1390 ms with the skip against 1388 ms without,
    // on the a-rate benchmark below. Kept because it is the correct shape and
    // it costs one boolean, and recorded because it corroborates what hoisting
    // the mix already showed - the per-sample cost here is the two divisions
    // and the tangent, and a seven-arm switch is not in the running.
    if (!typeChanged && !_mixReadsK) return;

    switch (type) {
      case SvfType.LowPass:
        _m0 = 0;
        _m1 = 0;
        _m2 = 1;
        _mixReadsK = false;
        break;
      // The *normalized* bandpass: unity gain at the centre frequency rather
      // than a gain of Q. The raw tap `_m1 = 1` peaks at exactly Q - +32 dB at
      // Q=40 - so sweeping resonance on a bandpass swept 38 dB of level with
      // it, which is not what `BiquadFilterNode` does and not what anyone
      // wants once `Q` tracks an envelope. Lazzarini & Timoney section 3.5:
      // "it is a simple matter of scaling it by a 1/Q factor in order to
      // rectify this". Zavalishin treats the normalized one as primary
      // throughout Chapter 4 (section 4.5, eq. 4.15), building notch and
      // allpass from it.
      //
      // Only the level moves: the -3 dB bandwidth at each Q is what it was.
      // The raw tap is recoverable with a gain of Q after the filter.
      case SvfType.BandPass:
        _m0 = 0;
        _m1 = _k;
        _m2 = 0;
        _mixReadsK = true;
        break;

      case SvfType.HighPass:
        _m0 = 1;
        _m1 = -_k;
        _m2 = -1;
        _mixReadsK = true;
        break;
      case SvfType.Notch:
        _m0 = 1;
        _m1 = -_k;
        _m2 = 0;
        _mixReadsK = true;
        break;
      case SvfType.Peak:
        _m0 = 1;
        _m1 = -_k;
        _m2 = -2;
        _mixReadsK = true;
        break;
      case SvfType.AllPass:
        _m0 = 1;
        _m1 = -2 * _k;
        _m2 = 0;
        _mixReadsK = true;
        break;
      default:
        _m0 = 1;
        _m1 = 0;
        _m2 = 0;
        _mixReadsK = false;
        break;
    }
  }

  // The per-sample half: one compare, one prewarp, one divide, three
  // multiplies. Nothing here reads `type`.
  //
  // Range [20, 20000] for `freq` - `params.ts` again, and `AudioParam` has
  // never known the sample rate, so at any sample rate below 40 kHz the
  // declared maximum is above Nyquist and `prewarp` is what keeps `g` on the
  // right side of the pole.
  function updateCutoff(freq: number) {
    if (freq === currFreq) return;
    currFreq = freq;

    const g = prewarp(freq);

    _a1 = 1 / (1 + g * (g + _k));
    _a2 = g * _a1;
    _a3 = g * _a2;
  }

  /**
   * Clears the integrator state. The package has never had one of these -
   * `createFilter` returned a bare function, so the only way to clear a filter
   * was to throw the closure away - and the block guard below is written in
   * terms of it rather than open-coding two assignments.
   */
  function reset() {
    _ic1eq = 0;
    _ic2eq = 0;
    _v1 = 0;
    _v2 = 0;
    _v3 = 0;
  }

  function filter(
    input: Float32Array,
    output: Float32Array,
    type: number,
    frequency: Float32Array,
    Q: Float32Array,
  ) {
    updateMixing(type, Q[0]);
    updateCutoff(frequency[0]);
    // The house a-rate check, hoisted, once per parameter. `> 1` and not
    // `=== input.length`: see `_worklet.ts` next to `ParamDescriptor`. A
    // length-1 array is what Chrome delivers for an unconnected parameter and
    // for a connected constant alike, so it is the common case rather than a
    // corner, and an unmodulated filter takes neither branch below.
    const fRate = frequency.length > 1;
    const qRate = Q.length > 1;
    const perSample = fRate || qRate;

    for (let i = 0; i < input.length; i++) {
      let x = input[i];

      if (perSample) {
        if (qRate) updateMixing(type, Q[i]);
        // Not redundant when only `Q` moves: `a1` reads `k`, and
        // `updateMixing` NaNs `currFreq` for exactly this reason. The guard
        // inside is what makes the call free when nothing moved.
        updateCutoff(fRate ? frequency[i] : frequency[0]);
      }

      _v3 = x - _ic2eq;
      _v1 = _a1 * _ic1eq + _a2 * _v3;
      _v2 = _ic2eq + _a2 * _ic1eq + _a3 * _v3;
      _ic1eq = 2 * _v1 - _ic1eq;
      _ic2eq = 2 * _v2 - _ic2eq;

      const out = _m0 * x + _m1 * _v1 + _m2 * _v2;

      output[i] = out;
    }

    // One non-finite sample at the *input* and the filter is dead for the life
    // of the AudioContext: `_ic1eq` and `_ic2eq` feed back into themselves
    // every sample, so there is no arithmetic path back from NaN. An upstream
    // divide by zero, a GainNode driven by an unconnected parameter, a decoded
    // buffer with a bad sample - none of that is this package's to prevent, and
    // a BiquadFilterNode survives it only because a finite delay line flushes.
    // A recursive filter has nothing to flush.
    //
    // Checked once a block on the *state* rather than 128 times on the input:
    // two comparisons against a loop that already costs about 21 ns a sample,
    // and it catches every route in rather than only this one. Recovery is a
    // click, which is the honest answer to a signal that was already broken;
    // ramping or muting would be guessing.
    if (!Number.isFinite(_ic1eq) || !Number.isFinite(_ic2eq)) reset();
  }

  return { filter, reset };
}
