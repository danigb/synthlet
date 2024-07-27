/**
 * Limit the value between min and max
 * @param value
 * @param min
 * @param max
 * @returns
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export enum SVFilterType {
  ByPass = 0,
  LowPass = 1,
  BandPass = 2,
  HighPass = 3,
}

export type Inputs = {
  filterType: number[];
  frequency: number[];
  resonance: number[];
};

/**
 * A State Variable Filter following the Andy Simper's implementation described in http://www.cytomic.com/files/dsp/SvfLinearTrapOptimised2.pdf
 *
 * Various implementations:
 * https://github.com/Ardour/ardour/blob/71e049202c017c0a546f39b455bdc9e4be182f06/libs/plugins/a-eq.lv2/a-eq.c
 * https://github.com/SoundStacks/cmajor/blob/main/standard_library/std_library_filters.cmajor#L157
 */
export function SVFilter(sampleRate: number) {
  // Params
  let $frequency = 1000;
  let $resonance = 0.5;
  let $type = SVFilterType.LowPass;

  const period = 0.5 / sampleRate;
  const pi2 = 2 * Math.PI;

  let d = 0;
  let a = 0;
  let g1 = 0;
  let z0 = 0;
  let z1 = 0;
  let high = 0;
  let band = 0;
  let low = 0;

  function update(inputs: Inputs) {
    $type = inputs.filterType[0];
    if (
      inputs.frequency[0] !== $frequency ||
      inputs.resonance[0] !== $resonance
    ) {
      $frequency = inputs.frequency[0];
      $resonance = inputs.resonance[0];
      const cutoffFreq = clamp($frequency, 16, sampleRate / 2);
      const Q = clamp($resonance, 0.025, 40);
      const invQ = 1.0 / Q;
      // TODO: review - something weird here (sampleRate * period = 0.5)
      a = 2.0 * sampleRate * Math.tan(pi2 * period * cutoffFreq) * period;
      d = 1.0 / (1.0 + invQ * a + a * a);
      g1 = a + invQ;
    }
  }

  function fill(input: Float32Array, output: Float32Array) {
    for (let i = 0; i < input.length; i++) {
      const x = input[i];
      high = (x - g1 * z0 - z1) * d;
      band = a * high + z0;
      low = a * band + z1;
      z0 = a * high + band;
      z1 = a * band + low;
      output[i] =
        $type === SVFilterType.LowPass
          ? low
          : $type === SVFilterType.HighPass
          ? high
          : $type === SVFilterType.BandPass
          ? band
          : x;
    }
  }
  return { update, fill };
}
