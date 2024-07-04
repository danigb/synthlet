import { Adsr } from "./adsr";

export class AdsrWorkletProcessor extends AudioWorkletProcessor {
  p: ReturnType<typeof Adsr>; // processor
  g: boolean; // is generator
  r: boolean = true; // running;

  constructor(options: any) {
    super();
    this.g = options?.processorOptions?.mode !== "modulator";
    this.p = Adsr(sampleRate);
    this.port.onmessage = (event) => {
      switch (event.data.type) {
        case "DISCONNECT":
          this.r = false;
          break;
      }
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], params: any) {
    const output = outputs[0][0];
    const input = inputs[0][0];
    if (this.g) {
      this.p.agen(output, params);
    } else if (input) {
      this.p.amod(input, output, params);
    }
    return this.r;
  }

  static get parameterDescriptors() {
    return [
      ["gate", 0, 0, 1],
      ["attack", 0.01, 0, 1],
      ["decay", 0.1, 0, 1],
      ["sustain", 0.5, 0, 1],
      ["release", 0.3, 0, 1],
      ["offset", 0, 0, 20000],
      ["gain", 1, -20000, 20000],
    ].map(([name, defaultValue, minValue, maxValue]) => ({
      name,
      defaultValue,
      minValue,
      maxValue,
      automationRate: "k-rate",
    }));
  }
}

registerProcessor("AdsrWorkletProcessor", AdsrWorkletProcessor);
