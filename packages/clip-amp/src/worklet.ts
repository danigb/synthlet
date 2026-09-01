import { getClipFn } from "./dsp";
import { PARAMS } from "./params";

export class ClipAmpProcessor extends AudioWorkletProcessor {
  r: boolean; // running
  g: boolean; // gate
  t: number; // type
  fn: (x: number) => number;

  constructor() {
    super();
    this.r = true;
    this.g = false;
    this.t = 0;
    this.fn = getClipFn(0);
    this.port.onmessage = (event) => {
      switch (event.data.type) {
        case "DISPOSE":
          this.r = false;
          break;
      }
    };
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: any,
  ) {
    if (this.t !== parameters.type[0]) {
      this.t = parameters.type[0];
      this.fn = getClipFn(this.t);
    }
    const pre = parameters.preGain[0];
    const post = parameters.postGain[0];
    const input = inputs[0];
    const output = outputs[0];

    // The clip is a pure function of the sample, so every channel is the same
    // loop with no state to keep apart.
    for (let c = 0; c < input.length && c < output.length; c++) {
      const inputChannel = input[c];
      const outputChannel = output[c];
      for (let i = 0; i < inputChannel.length; i++) {
        outputChannel[i] = this.fn(inputChannel[i] * pre) * post;
      }
    }

    return this.r;
  }

  static get parameterDescriptors() {
    return PARAMS;
  }
}

registerProcessor("ClipAmpProcessor", ClipAmpProcessor);
