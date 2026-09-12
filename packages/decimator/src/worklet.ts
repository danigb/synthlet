import { createDecimator } from "./dsp";
import { PARAMS } from "./params";

export class DecimatorProcessor extends AudioWorkletProcessor {
  r: boolean; // running
  d: ReturnType<typeof createDecimator>;

  constructor() {
    super();
    this.r = true;
    this.d = createDecimator(sampleRate);
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
    // A per-channel loop inside, over `input.length && output.length`, the way
    // `clip-amp` does it - so stereo in stays stereo out. The hold's clock is
    // shared across those channels and the filter state is not, which is what
    // a converter with two inputs and one crystal actually is.
    //
    // An unconnected input is an empty channel list, and the engine then does
    // nothing: the output stays the zeros the host handed in.
    this.d(inputs[0], outputs[0], parameters);

    return this.r;
  }

  static get parameterDescriptors() {
    return PARAMS;
  }
}

registerProcessor("DecimatorProcessor", DecimatorProcessor);
