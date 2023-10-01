import { toWorkletParams } from "../worklet-utils";
import { Osc, OscParams } from "./osc";

const IMPULSE_PARAMS = toWorkletParams(OscParams);

export class OscWorklet extends AudioWorkletProcessor {
  impulse: Osc;

  constructor() {
    super();
    this.impulse = new Osc(sampleRate);
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: any
  ) {
    const freq = parameters.freq[0];
    this.impulse.setParams(freq);
    const output = outputs[0];
    for (let i = 0; i < output.length; i++) {
      this.impulse.fillControl(output[i]);
    }
    return true;
  }

  static get parameterDescriptors() {
    return IMPULSE_PARAMS;
  }
}

registerProcessor("OscWorklet", OscWorklet);
