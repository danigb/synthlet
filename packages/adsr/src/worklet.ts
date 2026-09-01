import { createAdsr } from "./dsp";
import { PARAMS } from "./params";

export class AdsrProcessor extends AudioWorkletProcessor {
  p: ReturnType<typeof createAdsr>; // processor
  r: boolean = true; // running;
  m: boolean;

  constructor(options?: any) {
    super();
    this.m = options?.processorOptions?.mode === "modulator";
    this.p = createAdsr(sampleRate);
    this.port.onmessage = (event) => {
      switch (event.data.type) {
        case "DISPOSE":
          this.r = false;
          break;
      }
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], params: any) {
    const output = outputs[0][0];
    // In modulator mode an unconnected input has no channels; treat it as
    // silence so the envelope keeps running instead of process() throwing.
    const input = this.m ? (inputs[0][0] ?? silence(output.length)) : undefined;
    this.p(input!, output, this.m, params);
    return this.r;
  }

  static get parameterDescriptors() {
    return PARAMS;
  }
}

registerProcessor("AdsrProcessor", AdsrProcessor);

let SILENCE = new Float32Array(128);
function silence(length: number) {
  if (SILENCE.length < length) SILENCE = new Float32Array(length);
  return SILENCE;
}
