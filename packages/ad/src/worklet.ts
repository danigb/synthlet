import { PARAMS } from "./params";

export class AdProcessor extends AudioWorkletProcessor {
  r: boolean; // running
  m: boolean; // modulator mode: multiply the input by the envelope
  d: ReturnType<typeof createEnvelope>;

  constructor(options?: any) {
    super();
    this.r = true;
    this.m = options?.processorOptions?.mode === "modulator";
    this.d = createEnvelope(sampleRate);
    this.port.onmessage = (event) => {
      switch (event.data.type) {
        case "DISPOSE":
          this.r = false;
          break;
      }
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], params: any) {
    this.d.update(params.trigger[0], params.attack[0], params.decay[0]);
    this.d.gen(
      outputs[0],
      params.offset[0],
      params.gain[0],
      this.m ? inputs[0] : undefined,
    );

    return this.r;
  }

  static get parameterDescriptors() {
    return PARAMS;
  }
}

registerProcessor("AdProcessor", AdProcessor);

// Attack-Decay envelope based on https://paulbatchelor.github.io/sndkit/env/
function createEnvelope(sampleRate: number) {
  const MODE_ZERO = 0;
  const MODE_ATTACK = 1;
  const MODE_DECAY = 2;
  const EPS = 5e-8;

  // This time constants are obtained empirically
  const attackTime2Tau = sampleRate * 0.05;
  const decayTime2Tau = sampleRate * 0.1;

  // Convert seconds to time constants
  let gate = false;
  let attack = 0.1;
  let decay = 0.1;
  let attackEnv = Math.exp(-1.0 / (0.1 * attackTime2Tau));
  let decayEnv = Math.exp(-1.0 / (0.1 * decayTime2Tau));

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
        const tau = Math.max(attack * attackTime2Tau, 0.001);
        attackEnv = Math.exp(-1.0 / tau);
      }
      if (decayTime !== decay) {
        decay = decayTime;
        const tau = Math.max(decay * decayTime2Tau, 0.001);
        decayEnv = Math.exp(-1.0 / tau);
      }
    },
    // Generator mode (no input) writes the envelope itself; modulator mode
    // multiplies each input sample by it. Gain and offset apply to the result
    // in both cases, the same way the adsr package does it.
    //
    // The envelope advances once per sample and is then applied to every
    // channel the block has, so stereo in stays stereo out.
    gen(
      outputs: Float32Array[],
      offset: number,
      gain: number,
      inputs?: Float32Array[],
    ) {
      let out = 0;
      const channels = outputs.length;
      const length = outputs[0]?.length ?? 0;
      for (let i = 0; i < length; i++) {
        if (mode === MODE_ATTACK) {
          out = attackEnv * prev + (1.0 - attackEnv);
          if (out - prev <= EPS) {
            mode = MODE_DECAY;
          }
          prev = out;
        } else if (mode === MODE_DECAY) {
          out = decayEnv * prev;
          prev = out;
          if (out <= EPS) {
            mode = MODE_ZERO;
          }
        } else {
          out = 0;
        }

        for (let c = 0; c < channels; c++) {
          // A channel the input doesn't have -- including an input that isn't
          // connected at all -- is silence, not a crash.
          const value = inputs ? (inputs[c]?.[i] ?? 0) * out : out;
          outputs[c][i] = offset + value * gain;
        }
      }
    },
  };
}
