import { createKS } from "./dsp";

export class KsProcessor extends AudioWorkletProcessor {
  r: boolean; // running
  g: ReturnType<typeof createKS>;

  constructor() {
    super();
    this.r = true;
    this.g = createKS(sampleRate);
    this.port.onmessage = (event) => {
      switch (event.data.type) {
        case "DISPOSE":
          this.r = false;
          break;
      }
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], params: any) {
    const output = outputs[0][0];
    this.g(output, params.trigger[0]);

    return this.r;
  }

  static get parameterDescriptors() {
    return [["trigger", 0, 0, 1]].map(
      ([name, defaultValue, minValue, maxValue]) => ({
        name,
        defaultValue,
        minValue,
        maxValue,
        automationRate: "k-rate",
      })
    );
  }
}

registerProcessor("KsProcessor", KsProcessor);
