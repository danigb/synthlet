import { createKS } from "./dsp";
import { PARAMS } from "./params";

// The delay line has to hold the longest period the declared range asks for,
// so its size comes from `params.ts` rather than a literal: the buffer and the
// declared range cannot drift apart again. At 20 Hz / 44.1 kHz that is 2207
// floats (8.8 KB), allocated once per node.
const MIN_FREQUENCY = PARAMS.find((p) => p.name === "frequency")!.minValue;

export class KsProcessor extends AudioWorkletProcessor {
  r: boolean; // running
  g: ReturnType<typeof createKS>;

  constructor() {
    super();
    this.r = true;
    this.g = createKS(sampleRate, MIN_FREQUENCY);
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
    // The trigger goes down whole rather than as `[0]`, so it can be read per
    // sample. The descriptor stays `k-rate`, so by default that array has
    // length 1 and the read is one value for the block - identical to before,
    // and free. A caller who sets `trigger.automationRate = "a-rate"` gets the
    // sample-accurate pluck they asked for instead of one quantised to the
    // 128-frame render quantum (2.9 ms at 44.1 kHz).
    this.g(
      output,
      params.trigger,
      params.frequency,
      params.decay[0],
      params.brightness[0],
      params.level[0],
      params.dynamics[0],
      params.position[0],
      params.pickAngle[0],
      params.stretch[0],
      params.blend[0],
    );

    return this.r;
  }

  static get parameterDescriptors() {
    return PARAMS;
  }
}

registerProcessor("KsProcessor", KsProcessor);
