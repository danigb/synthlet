import { createClock } from "./dsp";
import { PARAMS } from "./params";

export class ClockWorkletProcessor extends AudioWorkletProcessor {
  r: boolean; // running
  g: ReturnType<typeof createClock>;

  constructor() {
    super();
    this.g = createClock(sampleRate);
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
    this.g(
      outputs[0][0],
      outputs[1]?.[0],
      parameters.bpm[0],
      parameters.pulseWidth[0],
      parameters.reset,
    );
    return this.r;
  }

  static get parameterDescriptors() {
    return PARAMS;
  }
}

registerProcessor("ClockWorkletProcessor", ClockWorkletProcessor);
