import { createFollower } from "./dsp";
import { PARAMS } from "./params";

export class EnvelopeFollowerProcessor extends AudioWorkletProcessor {
  r: boolean; // running
  f: ReturnType<typeof createFollower>;

  constructor() {
    super();
    this.r = true;
    this.f = createFollower(sampleRate);
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
    parameters: any,
  ) {
    const output = outputs[0][0];
    // One output channel, declared in `index.ts`. A host that gave none has
    // nothing for this to write to.
    if (!output) return this.r;

    // An unconnected input is an empty channel list, which the detector reads
    // as silence - so the envelope decays to zero rather than holding its last
    // value or dividing by a channel count of nought.
    this.f(inputs[0], output, parameters);

    return this.r;
  }

  static get parameterDescriptors() {
    return PARAMS;
  }
}

registerProcessor("EnvelopeFollowerProcessor", EnvelopeFollowerProcessor);
