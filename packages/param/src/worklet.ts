import { ConvertFn, getConverter } from "./dsp";

export class ParamProcessor extends AudioWorkletProcessor {
  r: boolean; // running
  t: number; // type
  c: ConvertFn;

  constructor() {
    super();
    this.r = true;
    this.t = 0;
    this.c = getConverter(this.t);
    this.port.onmessage = (event) => {
      switch (event.data.type) {
        case "DISCONNECT":
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
      this.c = getConverter(this.t);
    }

    const input = inputs[0][0];
    const inputValue = input ? input[0] : 0;
    const value = inputValue + parameters.input[0] + parameters.offset[0];
    outputs[0][0].fill(this.c(value, parameters.min[0], parameters.max[0]));

    return this.r;
  }

  static get parameterDescriptors() {
    return [
      ["type", 0, 0, 10],
      ["input", 0, 0, 1000000],
      ["offset", 0, 0, 1000000],
      ["min", 0, 0, 1000000],
      ["max", 1, 0, 1000000],
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
