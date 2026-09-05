import { createKS } from "./dsp";
import { PARAMS } from "./params";

// The delay line has to hold the longest period the declared range asks for,
// so its size comes from `params.ts` rather than a literal: the buffer and the
// declared range cannot drift apart again. At 20 Hz / 44.1 kHz that is 2207
// floats (8.8 KB), allocated once per node.
const MIN_FREQUENCY = PARAMS.find((p) => p.name === "frequency")!.minValue;

export class KsProcessor extends AudioWorkletProcessor {
  r: boolean; // running
  g: ReturnType<typeof createKS>;

  constructor() {
    super();
    this.r = true;
    this.g = createKS(sampleRate, MIN_FREQUENCY);
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
    this.g(output, params.trigger[0], params.frequency[0], params.decay[0]);

    return this.r;
  }

  static get parameterDescriptors() {
    return PARAMS;
  }
}

registerProcessor("KsProcessor", KsProcessor);
