import { createAdsr } from "./dsp";
import { PARAMS } from "./params";

export class AdsrProcessor extends AudioWorkletProcessor {
  p: ReturnType<typeof createAdsr>; // processor
  r: boolean = true; // running;
  m: boolean;

  constructor(options?: any) {
    super();
    this.m = options?.processorOptions?.mode === "modulator";
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
    // A channel the input doesn't have reads as silence in the dsp, which
    // covers both an unconnected input (no channels at all, which used to
    // throw) and an output wider than the input.
    this.p(inputs[0], outputs[0], this.m, params);
    return this.r;
  }

  static get parameterDescriptors() {
    return PARAMS;
  }
}

registerProcessor("AdsrProcessor", AdsrProcessor);
