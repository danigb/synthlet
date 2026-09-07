import { createPolyblepOscillator } from "./dsp";
import { PARAMS } from "./params";

export class PolyBLEProcessor extends AudioWorkletProcessor {
  r: boolean; // running
  g: ReturnType<typeof createPolyblepOscillator>;

  constructor(options?: any) {
    super();
    this.r = true;
    // `phase` is a construction option rather than an AudioParam: it is a
    // one-time initial condition - where the oscillator starts, and where a
    // `sync` edge restarts it - and an AudioParam would imply it meant
    // something continuously. Read the way `packages/ad/src/worklet.ts:12`
    // reads its `mode`; written the way
    // `packages/timestretch-audio-source/src/index.ts:87-97` writes its
    // configuration.
    this.g = createPolyblepOscillator(
      sampleRate,
      options?.processorOptions?.phase,
    );
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
    // `frequency`, `detune`, `width` and `sync` are a-rate: pass the whole
    // array through and let the DSP branch on its length.
    this.g(
      output,
      params.type[0],
      params.frequency,
      params.detune,
      params.width,
      params.sync,
    );
    return this.r;
  }

  static get parameterDescriptors() {
    return PARAMS;
  }
}

registerProcessor("PolyBLEProcessor", PolyBLEProcessor);
