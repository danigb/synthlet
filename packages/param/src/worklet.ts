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

    const out = outputs[0][0];
    const { input, mod, min, max, gain, offset } = params;

    // The house a-rate check, once per block and once per parameter: a param
    // being automated arrives as one value per sample, an unautomated one as a
    // single value. `> 1` and not `=== out.length`, because the second is only
    // right when the block is a whole render quantum.
    const inR = input.length > 1;
    const modR = mod.length > 1;

    // `scale` is k-rate, so the converter is fixed for the block: lift it out
    // of the loop, where it would otherwise be an indirect call through a
    // property 128 times a block, on the most-instantiated node in the library.
    // The four coefficients are k-rate too, and read once for the same reason.
    const convert = this.c;
    const $min = min[0];
    const $max = max[0];
    const $gain = gain[0];
    const $offset = offset[0];

    // The fast path, and it is the common one: with nothing connected - or with
    // a constant connected, which Chrome also collapses to length 1 - there is
    // one value for the block and no reason to write it 128 times over.
    if (!inR && !modR) {
      out.fill(convert(input[0] + mod[0], $min, $max) * $gain + $offset);
    } else {
      for (let i = 0; i < out.length; i++) {
        const value = (inR ? input[i] : input[0]) + (modR ? mod[i] : mod[0]);
        out[i] = convert(value, $min, $max) * $gain + $offset;
      }
    }

    return this.r;
  }

  static get parameterDescriptors() {
    return PARAMS;
  }
}

registerProcessor("ParamProcessor", ParamProcessor);
