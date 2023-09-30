import { toWorkletParams } from "../utils";
import { Impulse, ImpulseParams } from "./impulse";

const IMPULSE_PARAMS = toWorkletParams(ImpulseParams);

export class ImpulseWorklet extends AudioWorkletProcessor {
  impulse: Impulse;

  constructor() {
    super();
    this.impulse = new Impulse(sampleRate);
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

registerProcessor("ImpulseWorklet", ImpulseWorklet);
