import { createFilter } from "./dsp";

export class SvfProcessor extends AudioWorkletProcessor {
  r: boolean; // running
  p: ReturnType<typeof createFilter>;

  constructor() {
    super();
    this.r = true;
    this.p = createFilter(sampleRate);
    this.port.onmessage = (event) => {
      switch (event.data.type) {
        case "STOP":
          this.r = false;
          break;
      }
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], params: any) {
    if (inputs[0].length === 0) return this.r;

    const input = inputs[0][0];
    const output = outputs[0][0];
    this.p(input, output, params.type[0], params.frequency, params.Q[0]);

    return this.r;
  }

  static get parameterDescriptors() {
    return [
      ["type", 1, 0, 10, "k"],
      ["frequency", 1000, 20, 20000, "a"],
      ["Q", 0.5, 0.025, 40, "k"],
    ].map(([name, defaultValue, minValue, maxValue, rate]) => ({
      name,
      defaultValue,
      minValue,
      maxValue,
      automationRate: rate + "-rate",
    }));
  }
}

registerProcessor("SvfProcessor", SvfProcessor);
