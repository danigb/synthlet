import { createPolyblepOscillator } from "./dsp";
import { PARAMS } from "./params";

export class PolyBLEProcessor extends AudioWorkletProcessor {
  r: boolean; // running
  g: ReturnType<typeof createPolyblepOscillator>;

  constructor() {
    super();
    this.r = true;
    this.g = createPolyblepOscillator(sampleRate);
    this.port.onmessage = (event) => {
      switch (event.data.type) {
        case "DISPOSE":
          this.r = false;
          break;
      }
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][], params: any) {
    let output = outputs[0][0];
    // `frequency`, `detune` and `width` are a-rate: pass the whole array
    // through and let the DSP branch on its length.
    this.g(
      output,
      params.type[0],
      params.frequency,
      params.detune,
      params.width,
    );
    return this.r;
  }

  static get parameterDescriptors() {
    return PARAMS;
  }
}

registerProcessor("PolyBLEProcessor", PolyBLEProcessor);
