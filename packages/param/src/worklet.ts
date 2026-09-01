import { ConvertFn, getConverter } from "./dsp";
import { PARAMS } from "./params";

export class ParamProcessor extends AudioWorkletProcessor {
  r: boolean; // running
  s: number; //scale
  c: ConvertFn;

  constructor() {
    super();
    this.r = true;
    this.s = 0;
    this.c = getConverter(this.s);
    this.port.onmessage = (event) => {
      switch (event.data.type) {
        case "DISPOSE":
          this.r = false;
          break;
      }
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], params: any) {
    if (this.s !== params.scale[0]) {
      this.s = params.scale[0];
      this.c = getConverter(this.s);
    }

    const input = params.input[0] + params.mod[0];
    const scaled = this.c(input, params.min[0], params.max[0]);
    const out = scaled * params.gain[0] + params.offset[0];
    outputs[0][0].fill(out);

    return this.r;
  }

  static get parameterDescriptors() {
    return PARAMS;
  }
}

registerProcessor("ParamProcessor", ParamProcessor);
