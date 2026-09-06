import { WavetableOscillator } from "./wavetable-oscillator";
import { PARAMS } from "./params";

export class WavetableOscillatorWorkletProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return PARAMS;
  }

  u: ReturnType<typeof WavetableOscillator>; // unit
  r: boolean; // running

  // `phase` travels in `processorOptions` rather than as an `AudioParam`: it is
  // a one-time initial condition, and an `AudioParam` would promise it means
  // something continuously. Read once, here, so `"random"` is drawn per
  // instance — which is the point of it.
  constructor(options?: AudioWorkletNodeOptions) {
    super();
    this.u = WavetableOscillator(
      sampleRate,
      (options?.processorOptions as { phase?: number | "random" } | undefined)
        ?.phase,
    );
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
