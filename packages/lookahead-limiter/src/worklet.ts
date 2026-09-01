import { createLimiter, DEFAULT_LOOKAHEAD_MS } from "./dsp";
import { PARAMS } from "./params";

export class LookaheadLimiterProcessor extends AudioWorkletProcessor {
  p: ReturnType<typeof createLimiter>; // processor
  r: boolean = true; // running

  constructor(options?: any) {
    super();
    const lookahead =
      options?.processorOptions?.lookahead ?? DEFAULT_LOOKAHEAD_MS;
    this.p = createLimiter(sampleRate, lookahead);
    this.port.onmessage = (event) => {
      switch (event.data.type) {
        case "DISPOSE":
          this.r = false;
          break;
      }
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], params: any) {
    this.p(
      inputs[0],
      outputs[0],
      params.threshold,
      params.release[0],
      params.gain,
    );
    return this.r;
  }

  static get parameterDescriptors() {
    return PARAMS;
  }
}

registerProcessor("LookaheadLimiterProcessor", LookaheadLimiterProcessor);
