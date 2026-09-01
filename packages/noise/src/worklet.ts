import { getNoiseAlgorithm, NoiseAlgorithm } from "./dsp";
import { PARAMS } from "./params";

export class NoiseWorkletProcessor extends AudioWorkletProcessor {
  r: boolean; // running
  t: number; // type
  d: NoiseAlgorithm;

  constructor() {
    super();
    this.r = true;
    this.t = 0;
    this.d = getNoiseAlgorithm(0);
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
    if (this.t !== parameters.type[0]) {
      this.t = parameters.type[0];
      this.d = getNoiseAlgorithm(parameters.type[0]);
    }
    this.d(outputs[0][0]);
    return this.r;
  }

  static get parameterDescriptors() {
    return PARAMS;
  }
}

registerProcessor("NoiseWorkletProcessor", NoiseWorkletProcessor);
