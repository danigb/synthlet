import { toWorkletParams } from "../worklet-utils";
import { Impulse, ImpulseParams } from "./impulse";

const PARAM_DESCRIPTORS = toWorkletParams(ImpulseParams);

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
    const frequency = parameters.frequency[0];
    this.impulse.setParams(frequency);
    const output = outputs[0];
    for (let i = 0; i < output.length; i++) {
      this.impulse.fillControl(output[i]);
    }
    return true;
  }

  static get parameterDescriptors() {
    return PARAM_DESCRIPTORS;
  }
}

registerProcessor("ImpulseWorklet", ImpulseWorklet);
