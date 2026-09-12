import { createSlew } from "./dsp";
import { PARAMS } from "./params";

export class SlewLimiterProcessor extends AudioWorkletProcessor {
  r: boolean; // running
  s: ReturnType<typeof createSlew>;

  constructor() {
    super();
    this.r = true;
    this.s = createSlew(sampleRate);
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
    // Per-channel state, so a stereo control signal is two glides rather than
    // one applied twice. An unconnected input is an empty channel list, and
    // the loop then does nothing: the output stays the zeros the host handed
    // in, and the state is held for when something is connected again.
    this.s(inputs[0], outputs[0], parameters);

    return this.r;
  }

  static get parameterDescriptors() {
    return PARAMS;
  }
}

registerProcessor("SlewLimiterProcessor", SlewLimiterProcessor);
