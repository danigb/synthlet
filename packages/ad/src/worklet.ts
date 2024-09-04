export class AdProcessor extends AudioWorkletProcessor {
  r: boolean; // running
  d: ReturnType<typeof createEnvelope>;

  constructor() {
    super();
    this.r = true;
    this.d = createEnvelope(sampleRate, 0.01, 0.1);
    this.port.onmessage = (event) => {
      switch (event.data.type) {
        case "DISPOSE":
          this.r = false;
          break;
      }
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][], params: any) {
    this.d.update(params.trigger[0], params.attack[0], params.decay[0]);
    this.d.gen(outputs[0][0], params.offset[0], params.gain[0]);

    return this.r;
  }

  static get parameterDescriptors() {
    return [
      ["trigger", 0, 0, 1],
      ["attack", 0.01, 0, 10],
      ["decay", 0.1, 0, 10],
      ["offset", 0, 0, 20000],
      ["gain", 1, 0, 10000],
    ].map(([name, defaultValue, minValue, maxValue]) => ({
      name,
      defaultValue,
      minValue,
      maxValue,
      automationRate: "k-rate",
    }));
  }
}

registerProcessor("AdProcessor", AdProcessor);

// Attack-Decay envelope based on https://paulbatchelor.github.io/sndkit/env/
function createEnvelope(
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
  let decay = decayTime;
  let attackEnv = Math.exp(-1.0 / (attack * sampleRate));
  let decayEnv = Math.exp(-1.0 / (decay * sampleRate));

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
        attackEnv = Math.exp(-1.0 / (Math.max(attack, 0.001) * sampleRate));
      }
      if (decayTime !== decay) {
        decay = decayTime;
        decayEnv = Math.exp(-1.0 / (Math.max(decay, 0.001) * sampleRate));
      }
    },
    gen(output: Float32Array, offset: number, gain: number) {
      let out = 0;
      for (let i = 0; i < output.length; i++) {
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

        output[i] = offset + out * gain;
      }
    },
  };
}
