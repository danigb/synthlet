import { toWorkletParams } from "../worklet-utils";
import { Lfo, PARAMS } from "./lfo";

const DESCRIPTORS = toWorkletParams(PARAMS);

export class LfoWorklet extends AudioWorkletProcessor {
  lfo: Lfo;

  constructor() {
    super();
    this.lfo = new Lfo(sampleRate);
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: any
  ) {
    this.lfo.setParameters(
      parameters.waveform[0],
      parameters.frequency[0],
      parameters.gain[0],
      parameters.quantize[0]
    );
    const output = outputs[0];
    for (let i = 0; i < output.length; i++) {
      this.lfo.fillControlBuffer(output[i]);
    }
    return true;
  }

  static get parameterDescriptors() {
    return DESCRIPTORS;
  }
}

registerProcessor("LfoWorklet", LfoWorklet);
