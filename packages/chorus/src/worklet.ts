import { createChorus } from "./dsp";
import { PARAMS } from "./params";

export class ChorusProcessor extends AudioWorkletProcessor {
  r: boolean; // running
  u: ReturnType<typeof createChorus>["update"];
  g: ReturnType<typeof createChorus>["compute"];

  constructor() {
    super();
    this.r = true;
    const { compute, update } = createChorus(sampleRate);
    this.u = update;
    this.g = compute;
    this.port.onmessage = (event) => {
      switch (event.data.type) {
        case "DISPOSE":
          this.r = false;
          break;
      }
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], params: any) {
    if (inputs[0].length === 0) return this.r;

    this.u(
      params.mode[0],
      params.rate[0],
      params.depth[0],
      params.mix[0],
      params.width[0],
    );
    const inL = inputs[0][0];
    const inR = inputs[0].length > 1 ? inputs[0][1] : inL;
    this.g(inL, inR, outputs[0][0], outputs[0][1]);
    return this.r;
  }

  static get parameterDescriptors() {
    return PARAMS;
  }
}

registerProcessor("ChorusProcessor", ChorusProcessor);
