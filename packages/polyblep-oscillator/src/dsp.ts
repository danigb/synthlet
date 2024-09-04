export enum PolyblepWaveformType {
  SINE = 0,
  SAWTOOTH = 1,
  SQUARE = 2,
  TRIANGLE = 3,
}

export function createPolyblepOscillator(sampleRate: number) {
  const ivsr = 1 / sampleRate;

  let type = PolyblepWaveformType.SINE;
  let gen = sine;
  let freq = 440;
  let phase = 0;
  let inc = freq * ivsr;

  // Prev value (leaky integrator for saw)
  let z1 = 0;

  // DC blocker
  const R = Math.exp(-1.0 / (0.0025 * sampleRate));
  let x = 0;
  let y = 0;

  const GENS = [sine, saw, square, triangle];

  return function generate(
    output: Float32Array,
    waveformType: number,
    frequency: number
  ) {
    if (type !== waveformType) {
      type = waveformType;
      gen = GENS[type] ?? sine;
    }
    if (freq !== frequency) {
      freq = frequency;
      inc = freq * ivsr;
    }
    gen(output);
  };

  function sine(output: Float32Array) {
    for (let i = 0; i < output.length; i++) {
      output[i] = Math.sin(phase);
      phase += inc;
      if (phase > 1) phase -= 1;
    }
  }
  function saw(output: Float32Array) {
    for (let i = 0; i < output.length; i++) {
      // polyblep sawtooth
      output[i] = phase * 2 - 1 - polyblep(phase, inc);
      phase += inc;
      if (phase > 1) phase -= 1;
    }
  }
  function square(output: Float32Array) {
    for (let i = 0; i < output.length; i++) {
      // polyblep square
      output[i] =
        (phase < 0.5 ? -1 : 1) -
        polyblep(phase, inc) +
        polyblep((phase + 0.5) % 1, inc);
      phase += inc;
      if (phase > 1) phase -= 1;
    }
  }
  function triangle(output: Float32Array) {
    for (let i = 0; i < output.length; i++) {
      // polyblep square
      let val =
        (phase < 0.5 ? -1 : 1) -
        polyblep(phase, inc) +
        polyblep((phase + 0.5) % 1, inc);
      // integrate
      val *= 4 / freq;
      val += z1;
      z1 = val;
      // dc blocker
      y = val - x + R * y;
      x = val;
      output[i] = y * 0.8;

      phase += inc;
      if (phase > 1) phase -= 1;
    }
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
