import { getNoiseAlgorithm, NoiseAlgorithm } from "./dsp";

export class NoiseWorkletProcessor extends AudioWorkletProcessor {
  r: boolean; // running
  t: number; // type
  d: NoiseAlgorithm;

  constructor() {
    super();
    this.r = true;
    this.t = 0;
    this.d = getNoiseAlgorithm(sampleRate, 0);
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
      this.d = getNoiseAlgorithm(sampleRate, parameters.type[0]);
    }
    this.d(outputs[0][0]);
    return this.r;
  }

  static get parameterDescriptors() {
    return [["type", 0, 0, 100]].map(
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

registerProcessor("NoiseWorkletProcessor", NoiseWorkletProcessor);
