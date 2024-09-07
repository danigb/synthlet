import { SVFilter } from "./dsp";

export class Processor extends AudioWorkletProcessor {
  f: ReturnType<typeof SVFilter>;
  r: boolean; // running

  constructor() {
    super();
    this.f = SVFilter(sampleRate);
    this.r = true;
    this.port.onmessage = (event) => {
      switch (event.data.type) {
        case "STOP":
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
    const input = inputs[0][0];
    const output = outputs[0][0];
    this.f.update(parameters);
    if (input && output) {
      this.f.fill(input, output);
    }
    return this.r;
  }

  static get parameterDescriptors() {
    return [
      ["type", 1, 0, 3],
      ["frequency", 1000, 20, 20000],
      ["resonance", 1, 0, 40],
    ].map(([name, defaultValue, minValue, maxValue]) => ({
      name,
      defaultValue,
      minValue,
      maxValue,
      automationRate: "k-rate",
    }));
  }
}

registerProcessor("StateVariableFilterWorkletProcessor", Processor);
