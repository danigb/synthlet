import { createLfo } from "./dsp";

export class LfoWorkletProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      ["waveform", 1, 0, 100],
      ["frequency", 10, 0, 200],
      ["gain", 1, 0, 10000],
      ["offset", 0, -1000, 1000],
    ].map(([name, defaultValue, minValue, maxValue]) => ({
      name,
      defaultValue,
      minValue,
      maxValue,
      automationRate: "k-rate",
    }));
  }

  r: boolean; // running
  g: ReturnType<typeof createLfo>;

  constructor(options: any) {
    super();
    this.g = createLfo(sampleRate, false);
    this.r = true;
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
    this.g(outputs[0][0], parameters);
    return this.r;
  }
}

registerProcessor("LfoProcessor", LfoWorkletProcessor);
