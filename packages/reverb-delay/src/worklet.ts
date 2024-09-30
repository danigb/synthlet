import { ReverbDelayDsp } from "./dsp";

export class ReverbDelayProcessor extends AudioWorkletProcessor {
  r: boolean; // running
  d: ReverbDelayDsp;

  constructor() {
    super();
    this.r = true;
    this.d = new ReverbDelayDsp(sampleRate);
    this.port.onmessage = (event) => {
      switch (event.data.type) {
        case "DISPOSE":
          this.r = false;
          break;
      }
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], params: any) {
    if (inputs[0].length === 0) return this.r;

    this.d.update(
      params.delay[0],
      params.damping[0],
      params.size[0],
      params.diffusion[0],
      params.feedback[0],
      params.modDepth[0],
      params.modFreq[0]
    );
    this.d.process(inputs[0], outputs[0]);

    return this.r;
  }

  static get parameterDescriptors() {
    return [
      ["delay", 0.2, 0.001, 1.45],
      ["damping", 0.3, 0, 0.99],
      ["size", 1, 0.1, 3],
      ["diffusion", 0.5, 0, 0.99],
      ["feedback", 0.9, 0, 1],
      ["modDepth", 0.1, 0, 1],
      ["modFreq", 2, 0, 10],
    ].map(([name, defaultValue, minValue, maxValue]) => ({
      name,
      defaultValue,
      minValue,
      maxValue,
      automationRate: "k-rate",
    }));
  }
}

registerProcessor("ReverbDelayProcessor", ReverbDelayProcessor);
