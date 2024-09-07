import { ConvertFn, getConverter } from "./dsp";

export class ParamProcessor extends AudioWorkletProcessor {
  r: boolean; // running
  s: number; //scale
  c: ConvertFn;

  constructor() {
    super();
    this.r = true;
    this.s = 0;
    this.c = getConverter(this.s);
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
    if (this.s !== parameters.scale[0]) {
      this.s = parameters.scale[0];
      this.c = getConverter(this.s);
    }

    const input = parameters.input[0] + parameters.mod[0];
    const scaled = this.c(input, parameters.min[0], parameters.max[0]);
    const out = scaled * parameters.gain[0] + parameters.offset[0];
    outputs[0][0].fill(out);

    return this.r;
  }

  static get parameterDescriptors() {
    return [
      ["scale", 0, 0, 10],
      ["input", 0, -20000, 20000],
      ["offset", 0, -20000, 20000],
      ["min", 0, -20000, 20000],
      ["max", 1, -20000, 20000],
      ["gain", 1, -20000, 20000],
      ["mod", 0, -20000, 20000],
    ].map(([name, defaultValue, minValue, maxValue]) => ({
      name,
      defaultValue,
      minValue,
      maxValue,
      automationRate: "k-rate",
    }));
  }
}

registerProcessor("ParamProcessor", ParamProcessor);
