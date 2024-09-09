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

// Implementation based on https://github.com/FredAntonCorvest/Common-DSP/blob/master/Filter/SvfLinearTrapOptimised2.hpp
export function createFilter(sampleRate: number) {
  const invSr = 1 / sampleRate;

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
    // Range [16, sampleRate / 2] (clamped by AudioWorklet)
    currFreq = freq;
    // Range [0.025, 40] (clamped by AudioWorklet)
    currQ = q;

    const g = Math.tan(freq * invSr * Math.PI);
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
    q: number
  ) {
    update(type, frequency[0], q);
    const isARateParam = frequency.length === input.length;
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
