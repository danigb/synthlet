import { createLfo } from "./dsp";
import { PARAMS } from "./params";

export class LfoWorkletProcessor extends AudioWorkletProcessor {
  r: boolean; // running
  g: ReturnType<typeof createLfo>;

  constructor(options: any) {
    super();
    // The LFO's output is a signal, not a control value. At one value per
    // render quantum a 5 Hz sine steps by ~9% of its peak-to-peak amplitude at
    // the zero crossings - a stepped pitch on a frequency parameter, a 344 Hz
    // click train on a gain one. `createLfo`'s `audioRate` argument stays, and
    // `generateControlRate` with it: a documented alternative, still tested.
    this.g = createLfo(sampleRate, true);
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
    parameters: any,
  ) {
    this.g(outputs[0][0], parameters);
    return this.r;
  }

  static get parameterDescriptors() {
    return PARAMS;
  }
}

registerProcessor("LfoProcessor", LfoWorkletProcessor);
