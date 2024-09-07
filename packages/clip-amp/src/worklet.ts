import { getClipFn } from "./dsp";

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
    parameters: any
  ) {
    if (this.t !== parameters.type[0]) {
      this.t = parameters.type[0];
      this.fn = getClipFn(this.t);
    }
    const pre = parameters.preGain[0];
    const post = parameters.postGain[0];
    const input = inputs[0][0];
    const output = outputs[0][0];

    if (input && output) {
      for (let i = 0; i < input.length; i++) {
        output[i] = this.fn(input[i] * pre) * post;
      }
    }

    return this.r;
  }

  static get parameterDescriptors() {
    return [
      ["type", 0, 0, 10],
      ["preGain", 1, 0, 10],
      ["postGain", 1, 0, 10],
    ].map(([name, defaultValue, minValue, maxValue]) => ({
      name,
      defaultValue,
      minValue,
      maxValue,
      automationRate: "k-rate",
    }));
  }
}

registerProcessor("ClipAmpProcessor", ClipAmpProcessor);
