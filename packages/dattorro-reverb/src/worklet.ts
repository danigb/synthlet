import { ComputeFn, createDsp, UpdateFn } from "./dsp";

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
      p.level[0]
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
    return [
      ["filter", 0.7, 0, 1],
      ["inputDiffusion1", 0.75, 0, 1],
      ["inputDiffusion2", 0.625, 0, 1],
      ["decayDiffusion1", 0.7, 0, 0.999999],
      ["decayDiffusion2", 0.5, 0, 0.999999],
      ["decay", 0.5, 0, 1],
      ["damping", 0.25, 0, 1],
      ["dryWet", 1, -1, 1], // -1 dry, 0 equal, 1 wet
      ["level", 0.0, 0, 1], // decibels
    ].map(
      (x) =>
        new Object({
          name: x[0],
          defaultValue: x[1],
          minValue: x[2],
          maxValue: x[3],
          automationRate: "k-rate",
        })
    );
  }
}

registerProcessor("DattorroReverbProcessor", DattorroReverbProcessor);
