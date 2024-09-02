const PI2 = Math.PI * 2;

export function createSine(sampleRate: number, frequency: number) {
  const invsr = 1 / sampleRate;
  let phase = 0;
  let inc = frequency * invsr;

  return {
    update(frequency: number) {
      inc = frequency * invsr;
    },
    next(): number {
      const out = Math.sin(phase * PI2);
      phase += inc;
      if (phase >= 1) {
        phase -= 1;
      }
      return out;
    },
  };
}

export function createClick(_sampleRate: number, samples: number) {
  let gate = false;
  let remain = 0;

  return {
    update(trigger: number) {
      if (trigger === 1) {
        if (!gate) {
          gate = true;
          remain = samples;
        }
      } else {
        gate = false;
      }
    },
    next(): number {
      if (remain === 0) {
        return 0;
      } else {
        remain--;
        return 1;
      }
    },
  };
}

export function createFixedSin2(
  sampleRate: number,
  freq1: number,
  amp1: number,
  freq2: number,
  amp2: number
) {
  const invsr = 1 / sampleRate;
  let phase1 = 0;
  let phase2 = 0;
  let inc1 = freq1 * invsr;
  let inc2 = freq2 * invsr;

  return {
    next(): number {
      const osc1 = Math.sin(phase1 * PI2);
      const osc2 = Math.sin(phase2 * PI2);
      phase1 += inc1;
      phase2 += inc2;
      if (phase1 >= 1) {
        phase1 -= 1;
      }
      if (phase2 >= 1) {
        phase2 -= 1;
      }
      return osc1 * amp1 + osc2 * amp2;
    },
  };
}

export function createNoise(_sampleRate: number) {
  return {
    next(): number {
      return Math.random() * 2 - 1;
    },
  };
}

// State Variable Filter (mode = lowpass, highpass, bandpass)
export function createFilter(
  sampleRate: number,
  mode: number,
  resonance: number
) {
  let d = 0;
  let a = 0;
  let g1 = 0;
  let z0 = 0;
  let z1 = 0;
  let low = 0;
  let high = 0;
  let band = 0;
  const invQ = 1.0 / resonance;

  const period = 0.5 / sampleRate;
  const PI2 = 2 * Math.PI;

  return {
    update(frequency: number) {
      a = 2.0 * Math.tan(PI2 * period * frequency);
      d = 1.0 / (1.0 + invQ * a + a * a);
      g1 = a + invQ;
    },

    process(x: number) {
      high = (x - g1 * z0 - z1) * d;
      band = a * high + z0;
      low = a * band + z1;
      z0 = a * high + band;
      z1 = a * band + low;
      return mode === 0 ? low : mode === 1 ? high : mode === 2 ? band : x;
    },
  };
}

export function createGate() {
  let value = 0;
  return {
    update(trigger: number) {
      value = trigger === 1 ? 1 : 0;
    },
    next(): number {
      return value;
    },
  };
}

// Attack-Decay envelope based on https://paulbatchelor.github.io/sndkit/env/
export function createEnvelope(
  sampleRate: number,
  attackTime: number,
  decayTime: number
) {
  const MODE_ZERO = 0;
  const MODE_ATTACK = 1;
  const MODE_DECAY = 2;
  const EPS = 5e-8;

  // Convert seconds to time constants
  let gate = false;
  let attack = attackTime;
  let release = decayTime;
  let attackEnv = Math.exp(-1.0 / (attack * sampleRate));
  let decayEnv = Math.exp(-1.0 / (release * sampleRate));

  let mode = MODE_ZERO;
  let prev = 0;

  return {
    update(trigger: number, attackTime: number, decayTime: number) {
      if (trigger === 1) {
        if (!gate) {
          gate = true;
          mode = MODE_ATTACK;
        }
      } else {
        gate = false;
      }
      if (attackTime !== attack) {
        attack = attackTime;
        attackEnv = Math.exp(-1.0 / (attack * sampleRate));
      }
      if (decayTime !== release) {
        release = decayTime;
        decayEnv = Math.exp(-1.0 / (release * sampleRate));
      }
    },
    next(): number {
      let out = 0;

      switch (mode) {
        case MODE_ATTACK:
          out = attackEnv * prev + (1.0 - attackEnv);

          if (out - prev <= EPS) {
            mode = MODE_DECAY;
          }

          prev = out;
          break;

        case MODE_DECAY:
          out = decayEnv * prev;
          prev = out;

          if (out <= EPS) {
            mode = MODE_ZERO;
          }
          break;

        case MODE_ZERO:
        default:
          out = 0;
          break;
      }

      return out;
    },
  };
}
