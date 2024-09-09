export enum SvfType {
  ByPass = 0,
  LowPass = 1,
  BandPass = 2,
  HighPass = 3,
}

export type Filter = (
  input: Float32Array,
  output: Float32Array,
  frequency: Float32Array,
  Q: Float32Array
) => void;

export function createFilter(sampleRate: number) {
  const bypass: Filter = (input, output) => {
    for (let i = 0; i < input.length; i++) {
      output[i] = input[i];
    }
  };

  // state
  let z1 = 0;
  let z2 = 0;

  // coefficients
  let c1 = 0;
  let c2 = 0;

  // previous frequency and Q
  let prefFreq = 0;
  let prefQ = 0;

  const updateCoefficients = (frequency: number, q: number) => {
    if (frequency === prefFreq && q === prefQ) return;
    const f = frequency / sampleRate;
    // TODO: optimize
    const w = 2 * Math.tan(Math.PI * f);
    const a = w / (q ?? 0.000001);
    const b = w * w;
    c1 = (a + b) / (1 + a / 2 + b / 4);
    c2 = b / (a + b);
  };

  const hipass: Filter = (input, output, frequency, Q) => {
    for (let i = 0; i < input.length; i++) {
      updateCoefficients(frequency[i], Q[i]);
      const d0 = 1 - c1 / 2 + (c1 * c2) / 4;
      const x = input[i] - z1 - z2;
      output[i] = d0 * x;
      z2 += c2 * z1;
      z1 += c1 * x;
    }
  };

  const bandpass: Filter = (input, output, frequency, Q) => {
    for (let i = 0; i < input.length; i++) {
      updateCoefficients(frequency[0], Q[0]);
      const d0 = ((1 - c2) * c1) / 2;
      const d1 = 1 - c2;
      const x = input[0] - z1 - z2;
      output[i] = d0 * x + d1 * z1;
      z2 += c2 * z1;
      z1 += c1 * x;
    }
  };

  const lowpass: Filter = (input, output, frequency, Q) => {
    for (let i = 0; i < input.length; i++) {
      updateCoefficients(frequency[0], Q[0]);
      const d0 = (c1 * c2) / 4;
      const x = input[0] - z1 - z2;
      z2 += c2 * z1;
      output[i] = d0 * x + z2;
      z1 += c1 * x;
    }
  };

  return function get(type: number) {
    switch (type) {
      case SvfType.LowPass:
        return lowpass;
      case SvfType.BandPass:
        return bandpass;
      case SvfType.HighPass:
        return hipass;
      default:
        return bypass;
    }
  };
}
