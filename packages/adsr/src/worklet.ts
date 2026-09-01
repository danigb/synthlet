import { createAdsr } from "./dsp";
import { PARAMS } from "./params";

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
    return PARAMS;
  }
}

registerProcessor("AdsrProcessor", AdsrProcessor);
