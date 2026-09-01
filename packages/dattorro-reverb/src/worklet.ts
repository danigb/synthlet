import { ComputeFn, createDsp, UpdateFn } from "./dsp";
import { PARAMS } from "./params";

export class DattorroReverbProcessor extends AudioWorkletProcessor {
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
    this.u(
      p.filter[0],
      p.inputDiffusion1[0],
      p.inputDiffusion2[0],
      p.decayDiffusion1[0],
      p.decayDiffusion2[0],
      p.decay[0],
      p.damping[0],
      p.dryWet[0],
      p.level[0],
    );

    const in1 = inputs[0];
    const out1 = outputs[0];

    if (in1.length === 0 || out1.length === 0) {
      return this.r;
    }

    this.c(in1, out1, out1[0].length);
    return this.r;
  }

  static get parameterDescriptors() {
    return PARAMS;
  }
}

registerProcessor("DattorroReverbProcessor", DattorroReverbProcessor);
