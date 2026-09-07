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

  // previous frequency and Q
  let currType = -1;
  let currFreq = 0;
  let currQ = 0;

  function update(type: number, freq: number, q: number) {
    if (freq === currFreq && currType === type && q === currQ) return;

    // Range [0, 6] (clamped by AudioWorklet)
    currType = type;
    // Range [20, 20000], the compile-time constants in `params.ts`. That is
    // all `AudioParam` clamps to: it has never known the sample rate, so at
    // any sample rate below 40 kHz the declared maximum is above Nyquist and
    // the prewarping is what keeps `g` on the right side of the pole.
    currFreq = freq;
    // Range [0.025, 40] (clamped by AudioWorklet)
    currQ = q;

    const g = prewarp(freq);
    const k = 1 / Math.max(q, 0.0001);

    _a1 = 1 / (1 + g * (g + k));
    _a2 = g * _a1;
    _a3 = g * _a2;

    switch (type) {
      case SvfType.LowPass:
        _m0 = 0;
        _m1 = 0;
        _m2 = 1;
        break;
      case SvfType.BandPass:
        _m0 = 0;
        _m1 = 1;
        _m2 = 0;
        break;

      case SvfType.HighPass:
        _m0 = 1;
        _m1 = -k;
        _m2 = -1;
        break;
      case SvfType.Notch:
        _m0 = 1;
        _m1 = -k;
        _m2 = 0;
        break;
      case SvfType.Peak:
        _m0 = 1;
        _m1 = -k;
        _m2 = -2;
        break;
      case SvfType.AllPass:
        _m0 = 1;
        _m1 = -2 * k;
        _m2 = 0;
        break;
      default:
        _m0 = 1;
        _m1 = 0;
        _m2 = 0;
        break;
    }
  }

  return function filter(
    input: Float32Array,
    output: Float32Array,
    type: number,
    frequency: Float32Array,
    q: number,
  ) {
    update(type, frequency[0], q);
    // The house a-rate check, hoisted. `> 1` and not `=== input.length`:
    // see `_worklet.ts` next to `ParamDescriptor`.
    const isARateParam = frequency.length > 1;
    for (let i = 0; i < input.length; i++) {
      let x = input[i];
      let freq = frequency[i];

      if (isARateParam) update(type, frequency[i], q);

      _v3 = x - _ic2eq;
      _v1 = _a1 * _ic1eq + _a2 * _v3;
      _v2 = _ic2eq + _a2 * _ic1eq + _a3 * _v3;
      _ic1eq = 2 * _v1 - _ic1eq;
      _ic2eq = 2 * _v2 - _ic2eq;

      const out = _m0 * x + _m1 * _v1 + _m2 * _v2;

      output[i] = out;
    }
  };
}
