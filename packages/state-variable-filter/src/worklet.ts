import { createFilter } from "./dsp";
import { PARAMS } from "./params";

export class SvfProcessor extends AudioWorkletProcessor {
  r: boolean; // running
  p: ReturnType<typeof createFilter>[]; // one filter per channel

  constructor() {
    super();
    this.r = true;
    this.p = [];
    this.port.onmessage = (event) => {
      switch (event.data.type) {
        case "DISPOSE":
          this.r = false;
          break;
      }
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], params: any) {
    const input = inputs[0];
    const output = outputs[0];
    if (input.length === 0) return this.r;

    for (let c = 0; c < input.length && c < output.length; c++) {
      // Each channel needs its own filter state: sharing one across channels
      // would bleed the left channel into the right, not just blur it. The
      // filters are built on the first block that has that many channels.
      const filter = (this.p[c] ??= createFilter(sampleRate));
      filter(
        input[c],
        output[c],
        params.type[0],
        params.frequency,
        params.Q[0],
      );
    }

    return this.r;
  }

  static get parameterDescriptors() {
    return PARAMS;
  }
}

registerProcessor("SvfProcessor", SvfProcessor);
