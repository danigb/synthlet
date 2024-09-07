import { createNoise } from "./dsp";

export class PolyBLEProcessor extends AudioWorkletProcessor {
  r: boolean; // running
  g: ReturnType<typeof createNoise>;

  constructor() {
    super();
    this.r = true;
    this.g = createNoise(sampleRate);
    this.port.onmessage = (event) => {
      switch (event.data.type) {
        case "DISPOSE":
          this.r = false;
          break;
      }
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][], params: any) {
    let output = outputs[0][0];
    if (output) {
      this.g(outputs[0][0], params.type[0], params.frequency[0]);
    }
    return this.r;
  }

  static get parameterDescriptors() {
    return [
      ["type", 0, 0, 2],
      ["frequency", 440, 0, 20000],
    ].map(([name, defaultValue, minValue, maxValue]) => ({
      name,
      defaultValue,
      minValue,
      maxValue,
      automationRate: "k-rate",
    }));
  }
}

registerProcessor("PolyBLEProcessor", PolyBLEProcessor);
