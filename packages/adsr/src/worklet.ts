import { createAdsr } from "./dsp";

export class AdsrProcessor extends AudioWorkletProcessor {
  p: ReturnType<typeof createAdsr>; // processor
  r: boolean = true; // running;
  m: boolean;

  constructor(options: any) {
    super();
    this.m = options.processorOptions.mode === "modulator";
    this.p = createAdsr(sampleRate);
    this.port.onmessage = (event) => {
      switch (event.data.type) {
        case "DISPOSE":
          this.r = false;
          break;
      }
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], params: any) {
    const input = this.m ? inputs[0][0] : undefined;
    const output = outputs[0][0];
    this.p(input!, output, this.m, params);
    return this.r;
  }

  static get parameterDescriptors() {
    return [
      ["gate", 0, 0, 1],
      ["attack", 0.01, 0, 10],
      ["decay", 0.1, 0, 10],
      ["sustain", 0.5, 0, 1],
      ["release", 0.3, 0, 100],
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

registerProcessor("AdsrProcessor", AdsrProcessor);
