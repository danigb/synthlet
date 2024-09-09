type Generator = (out: Float32Array) => void;

export enum PolyblepOscillatorType {
  Sawtooth = 0,
  Square = 1,
  Triangle = 2,
}

export function createPolyblep(sampleRate: number) {
  const ivsr = 1 / sampleRate;
  const generators: Generator[] = [sawtooth, square, triangle];

  let gen = generators[0];
  let dt = 0;
  let phase = 0;

  let $type = 0;
  let $freq = 0;
  let $detune = 0;

  return function generate(
    output: Float32Array,
    type: number,
    freq: number,
    detune: number
  ) {
    if ($type !== type) {
      $type = type;
      gen = generators[$type] ?? generators[0];
    }
    if ($freq !== freq || detune !== $detune) {
      $freq = freq;
      $detune = detune;

      const detuneFactor = Math.pow(2, detune / 1200);
      const freqWithDetune = freq * detuneFactor;
      dt = freqWithDetune * ivsr;
    }
    gen(output);
  };

  // See http://research.spa.aalto.fi/publications/papers/smc2010-phaseshaping/phaseshapers.py
  function sawtooth(out: Float32Array) {
    for (let i = 0; i < out.length; i++) {
      let correction =
        phase < dt
          ? Math.sqrt(phase / dt - 1)
          : phase > 1 - dt
          ? -Math.sqrt((phase - 1) / dt + 1)
          : 0;
      out[i] = correction + phase * 2 - 1;
      phase += dt;
      if (phase >= 1) phase -= 1;
    }
  }

  function square(out: Float32Array) {
    for (let i = 0; i < out.length; i++) {
      let t1 = phase;
      let t2 = phase + 0.5;

      let y = t1 < 0.5 ? 1 : -1;

      // y += poly_blep(t1, dt);
      if (t1 < dt) {
        y -= Math.pow(t1 / dt - 1, 2);
      } else if (t1 > 1 - dt) {
        y += Math.pow((t1 - 1) / dt + 1, 2);
      }

      // y -= poly_blep(t2 - (t2|0), dt);
      t2 -= Math.floor(t2);
      if (t2 < dt) {
        y += Math.pow(t2 / dt - 1, 2);
      } else if (t2 > 1 - dt) {
        y -= Math.pow((t2 - 1) / dt + 1, 2);
      }

      out[i] = y;
      phase += dt;
      if (phase >= 1) phase -= 1;
    }
  }

  function triangle(out: Float32Array) {
    for (let i = 0; i < out.length; i++) {
      let t0 = phase;
      let t1 = t0 + 0.25;
      let t2 = t1 + 0.5;

      let y = Math.abs((((t0 + 0.75) | 0) - t0) * 4 - 1) - 1;

      // y += poly_blamp(t1 - (t1|0), dt) * 4*dt;
      t1 -= Math.floor(t1);
      if (t1 < dt) {
        let p = t1 / dt - 1;
        y -= Math.pow(p, 2) * p * 1.3333333333333333 * dt;
      } else if (t1 > 1 - dt) {
        let p = (t1 - 1) / dt + 1;
        y += Math.pow(p, 2) * p * 1.3333333333333333 * dt;
      }

      // y -= poly_blamp(t2 - (t2|0), dt) * 4*dt;
      t2 -= Math.floor(t2);
      if (t2 < dt) {
        let p = t2 / dt - 1;
        y += Math.pow(p, 2) * p * 1.3333333333333333 * dt;
      } else if (t2 > 1 - dt) {
        let p = (t2 - 1) / dt + 1;
        y -= Math.pow(p, 2) * p * 1.3333333333333333 * dt;
      }

      out[i] = y;
      phase += dt;
      if (phase >= 1) phase -= 1;
    }
  }
}
