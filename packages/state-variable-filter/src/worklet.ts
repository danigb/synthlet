import { createFilter } from "./dsp";

export class SvfProcessor extends AudioWorkletProcessor {
  r: boolean; // running
  d: ReturnType<typeof createFilter>;

  constructor() {
    super();
    this.r = true;
    this.d = createFilter(sampleRate);
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

    const filter = this.d(params.type[0]);
    filter(inputs[0][0], outputs[0][0], params.frequency, params.Q);

    return this.r;
  }

  static get parameterDescriptors() {
    return [
      ["type", 1, 0, 3, "k"],
      ["frequency", 1000, 20, 20000, "a"],
      ["Q", 1, 0, 40, "a"],
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
