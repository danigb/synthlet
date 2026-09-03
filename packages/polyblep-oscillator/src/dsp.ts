// TODO: Add more waveforms: https://gist.github.com/danigb/c86f94ad5145f2367fb4880c227824ec

export enum PolyblepOscillatorType {
  Sawtooth = 0,
  Square = 1,
  Triangle = 2,
}

export function createPolyblep(sampleRate: number) {
  const ivsr = 1 / sampleRate;

  // Stages caps the increment at 0.25 cycles/sample (kMaxFrequency,
  // refs/eurorack/stages/oscillator.h:53). Anything at or above 0.5 makes
  // polyblep()'s two branches overlap; 0.25 also leaves room for the 4-point
  // kernel, whose support is +/-2 samples.
  const MAX_INC = 0.25;

  let type = 0;
  let freq = 440;
  let phase = 0;
  let inc = freq * ivsr;

  // Triangle integrator accumulator
  let z1 = 0;

  // DC blocker
  const R = Math.exp(-1.0 / (0.0025 * sampleRate));
  let x = 0;
  let y = 0;

  const GENS = [saw, square, triangle];
  const LAST_GEN = GENS.length - 1;
  let gen = GENS[0];

  // Param cache
  let $detune = 0;

  return function generate(
    output: Float32Array,
    waveformType: number,
    frequency: number,
    detune: number,
  ) {
    // `type` is an AudioParam, so it arrives as a float. Round to the nearest
    // waveform and clamp; the comparisons resolve a NaN to 0 rather than leaving
    // `gen` undefined.
    const rounded = Math.round(waveformType);
    const index = rounded > 0 ? (rounded < LAST_GEN ? rounded : LAST_GEN) : 0;
    if (type !== index) {
      type = index;
      gen = GENS[index];
      // The integrator and the DC blocker belong to the triangle alone: start
      // them from rest instead of resuming a stale accumulator.
      z1 = x = y = 0;
    }
    if (freq !== frequency || detune !== $detune) {
      freq = frequency;
      $detune = detune;

      const detuneFactor = Math.pow(2, detune / 1200);
      const step = freq * detuneFactor * ivsr;
      // Clamp to [0, MAX_INC]; the comparisons also resolve a NaN to 0, so no
      // input can run the phase away or poison the integrator.
      inc = step > 0 ? (step < MAX_INC ? step : MAX_INC) : 0;
    }
    gen(output);
  };

  function saw(output: Float32Array) {
    for (let i = 0; i < output.length; i++) {
      // polyblep sawtooth
      output[i] = phase * 2 - 1 - polyblep(phase, inc);
      phase += inc;
      phase -= Math.floor(phase);
    }
  }
  function square(output: Float32Array) {
    for (let i = 0; i < output.length; i++) {
      // polyblep square
      output[i] =
        (phase < 0.5 ? -1 : 1) -
        polyblep(phase, inc) +
        polyblep(halfPhase(phase), inc);
      phase += inc;
      phase -= Math.floor(phase);
    }
  }
  function triangle(output: Float32Array) {
    for (let i = 0; i < output.length; i++) {
      // polyblep square
      let val =
        (phase < 0.5 ? -1 : 1) -
        polyblep(phase, inc) +
        polyblep(halfPhase(phase), inc);
      // integrate: over the half period of 1 / (2 * inc) samples the accumulator
      // must traverse 2 units, so the gain is 4 * inc
      val *= 4 * inc;
      val += z1;
      z1 = val;
      // dc blocker
      y = val - x + R * y;
      x = val;
      output[i] = y;

      phase += inc;
      phase -= Math.floor(phase);
    }
  }

  /*
   * The phase half a cycle away, branched to match the `phase < 0.5` test that
   * picks the base level. `(phase + 0.5) % 1` disagrees with it for the double
   * immediately below 0.5: the sum rounds up to exactly 1.0 and wraps to 0, so
   * the rising edge's correction is applied with the falling edge's sign and the
   * sample comes out at -2. Reachable at inc = 0.05, i.e. 2205 Hz at 44.1 kHz.
   */
  function halfPhase(phase: number): number {
    return phase < 0.5 ? phase + 0.5 : phase - 0.5;
  }

  /*
   * This algorithm centers around a tiny function called polyblep.
   * It applies two different polynomial curves if the position is at the beginning or ends of the position.
   */
  function polyblep(phase: number, increment: number): number {
    if (phase < increment) {
      const p = phase / increment;
      return p + p - p * p - 1;
    } else if (phase > 1 - increment) {
      const p = (phase - 1) / increment;
      return p + p + p * p + 1;
    } else {
      return 0;
    }
  }
}
