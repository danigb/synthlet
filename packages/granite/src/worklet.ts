import { ComputeFn, createDsp, UpdateFn } from "./dsp";
import { PARAMS } from "./params";

export class GraniteProcessor extends AudioWorkletProcessor {
  r: boolean; // running
  u: UpdateFn;
  c: ComputeFn;

  constructor() {
    super();
    this.r = true;
    const { update, compute } = createDsp(sampleRate);
    this.u = update;
    this.c = compute;
    this.port.onmessage = (event) => {
      switch (event.data.type) {
        case "DISPOSE":
          this.r = false;
          break;
      }
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], p: any) {
    this.u(p.wet[0], p.speed[0], p.density[0], p.spread[0]);
    const in1 = inputs[0];
    const out1 = outputs[0];

    if (in1.length === 0 || out1.length === 0) {
      return this.r;
    }

    this.c(in1, out1, in1[0].length);

    return this.r;
  }

  static get parameterDescriptors() {
    return PARAMS;
  }
}

registerProcessor("GraniteProcessor", GraniteProcessor);
