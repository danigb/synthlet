import { WavetableOscillator } from "./wavetable-oscillator";
import { PARAMS } from "./params";

export class WavetableOscillatorWorkletProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return PARAMS;
  }

  u: ReturnType<typeof WavetableOscillator>; // unit
  r: boolean; // running

  constructor() {
    super();
    this.u = WavetableOscillator(sampleRate);
    this.r = true;
    this.port.onmessage = (event) => {
      switch (event.data.type) {
        case "WAVETABLE":
          this.u.set(
            event.data.wavetable,
            event.data.length,
            event.data.levels,
          );
          break;
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
    this.u.agen(outputs[0][0], parameters);
    return this.r;
  }
}

registerProcessor(
  "WavetableOscillatorWorkletProcessor",
  WavetableOscillatorWorkletProcessor,
);
