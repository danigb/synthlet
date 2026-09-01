import { createLfo } from "./dsp";
import { PARAMS } from "./params";

export class LfoWorkletProcessor extends AudioWorkletProcessor {
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

  static get parameterDescriptors() {
    return PARAMS;
  }
}

registerProcessor("LfoProcessor", LfoWorkletProcessor);
