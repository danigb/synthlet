import { toWorkletParams } from "../worklet-utils";
import { Adsr, AdsrParams } from "./adsr";

const ADSR_PARAMS = toWorkletParams(AdsrParams);

export class AdsrWorklet extends AudioWorkletProcessor {
  dt: number;
  adsr: Adsr;

  constructor() {
    super();
    this.adsr = new Adsr(sampleRate);
  }
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: any
  ) {
    const gate = parameters.gate[0];
    this.adsr.setGate(gate);
    this.adsr.setParams(
      parameters.attack[0],
      parameters.decay[0],
      parameters.sustain[0],
      parameters.release[0]
    );

    const input = inputs[0];
    const output = outputs[0];
    const channels = Math.min(input.length, output.length);
    if (channels === 0) return true;
    const length = input[0].length;

    for (let i = 0; i < length; i++) {
      for (let j = 0; j < channels; j++) {
        output[j][i] = input[j][i] * this.adsr.process();
      }
    }

    return true;
  }

  static get parameterDescriptors() {
    return ADSR_PARAMS;
  }
}

registerProcessor("AdsrWorklet", AdsrWorklet);
