export function createSine(sampleRate: number) {
  const isampleRate = 1 / sampleRate;
  const pi2 = Math.PI * 2;
  let phase = 0;
  let inc = 0;

  return {
    update(frequency: number) {
      inc = frequency * isampleRate;
    },
    generate(output: Float32Array) {
      for (let i = 0; i < output.length; i++) {
        output[i] = Math.sin(phase * pi2);
        phase += inc;
        if (phase >= 1) {
          phase -= 1;
        }
      }
    },
  };
}

// State Variable Filter (mode = lowpass, highpass, bandpass)
export function createFilter(sampleRate: number, mode: number) {
  let d = 0;
  let a = 0;
  let g1 = 0;
  let z0 = 0;
  let z1 = 0;
  let high = 0;
  let band = 0;
  let low = 0;

  const period = 0.5 / sampleRate;
  const pi2 = 2 * Math.PI;

  return {
    update(frequency: number, resonance: number) {
      const invQ = 1.0 / resonance;
      a = 2.0 * Math.tan(pi2 * period * frequency);
      d = 1.0 / (1.0 + invQ * a + a * a);
      g1 = a + invQ;
    },

    process(input: Float32Array) {
      for (let i = 0; i < input.length; i++) {
        const x = input[i];
        high = (x - g1 * z0 - z1) * d;
        band = a * high + z0;
        low = a * band + z1;
        z0 = a * high + band;
        z1 = a * band + low;
        input[i] = mode === 0 ? low : mode === 1 ? high : mode === 2 ? band : x;
      }
    },
  };
}

// Attack-Hold-Release envelope based on https://paulbatchelor.github.io/sndkit/env/
export function createEnvelope(
  sampleRate: number,
  attack: number,
  release: number,
  hold: number
) {
  const MODE_ZERO = 0;
  const MODE_ATTACK = 1;
  const MODE_HOLD = 2;
  const MODE_RELEASE = 3;
  const EPS = 5e-8;

  // Convert seconds to time constants
  const atk_env = Math.exp(-1.0 / (attack * sampleRate));
  const rel_env = Math.exp(-1.0 / (release * sampleRate));

  // Increment for hold time
  const inc = hold <= 0 ? 1.0 : 1.0 / (hold * sampleRate);

  let timer = 0;
  let mode = MODE_ZERO;
  let prev = 0;

  return {
    update(trigger: number) {
      if (trigger === 1) {
        mode = MODE_ATTACK;
      }
    },
    process(output: Float32Array) {
      for (let i = 0; i < output.length; i++) {
        let out = 0;

        switch (mode) {
          case MODE_ATTACK:
            out = atk_env * prev + (1.0 - atk_env);

            if (out - prev <= EPS) {
              mode = MODE_HOLD;
              timer = 0;
            }

            prev = out;
            break;

          case MODE_HOLD:
            out = prev;
            timer += inc;

            if (timer >= 1.0) {
              mode = MODE_RELEASE;
            }
            break;

          case MODE_RELEASE:
            out = rel_env * prev;
            prev = out;

            if (out <= EPS) {
              mode = MODE_ZERO;
            }
            break;

          case MODE_ZERO:
            out = 0;
            break;

          default:
            break;
        }

        output[i] = out;
      }
    },
  };
}
