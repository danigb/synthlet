import { createEuclid, GenerateFn, UpdateFn } from "./dsp";
import { PARAMS } from "./params";

export class EuclidProcessor extends AudioWorkletProcessor {
  r: boolean; // running
  g: GenerateFn;
  u: UpdateFn;

  constructor() {
    super();
    this.r = true;
    const [generate, update] = createEuclid();
    this.g = generate;
    this.u = update;
    this.port.onmessage = (event) => {
      switch (event.data.type) {
        case "DISPOSE":
          this.r = false;
          break;
      }
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], params: any) {
    this.u(params.steps[0], params.beats[0], params.rotation[0]);
    this.g(
      outputs,
      params.clock,
      params.subdivision[0],
      params.pulseWidth[0],
      params.spread[0],
      params.reset,
    );

    return this.r;
  }

  static get parameterDescriptors() {
    return PARAMS;
  }
}

registerProcessor("EuclidProcessor", EuclidProcessor);
