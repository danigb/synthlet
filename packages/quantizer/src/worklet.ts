import { createQuantizer } from "./dsp";
import { PARAMS } from "./params";

export class QuantizerProcessor extends AudioWorkletProcessor {
  r: boolean; // running
  q: ReturnType<typeof createQuantizer>;

  constructor() {
    super();
    this.r = true;
    this.q = createQuantizer();
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
    if (!output) return this.r;

    const input = params.input;
    const scale = params.scale[0];
    const root = params.root[0];
    const hysteresis = params.hysteresis[0];
    const mode = params.output[0];

    // The house a-rate check, once per block: an automated param arrives as one
    // value per sample, an unautomated one as a single value. `> 1` and not
    // `=== output.length`, because the second is only right when the block is a
    // whole render quantum.
    if (input.length > 1) {
      // The engine caches the note's zone, so the samples that change nothing
      // - which is nearly all of them - cost two comparisons each.
      for (let i = 0; i < output.length; i++) {
        output[i] = this.q(input[i], scale, root, hysteresis, mode);
      }
    } else {
      // The common case, and the one a sample-and-hold produces: one value for
      // the block, so there is no reason to write it 128 times over.
      output.fill(this.q(input[0], scale, root, hysteresis, mode));
    }

    return this.r;
  }

  static get parameterDescriptors() {
    return PARAMS;
  }
}

registerProcessor("QuantizerProcessor", QuantizerProcessor);
