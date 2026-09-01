import { createArpeggiator } from "./dsp";
import { PARAMS } from "./params";

export class ArpProcessor extends AudioWorkletProcessor {
  r: boolean; // running
  a: ReturnType<typeof createArpeggiator>;

  constructor() {
    super();
    this.r = true;
    this.a = createArpeggiator();
    this.port.onmessage = (event) => {
      switch (event.data.type) {
        case "DISPOSE":
          this.r = false;
          break;
      }
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], params: any) {
    const note = this.a(
      params.trigger[0],
      params.baseNote[0],
      params.scale[0],
      params.octaves[0]
    );
    const output = outputs[0][0];
    if (output) output.fill(note);
    return this.r;
  }

  static get parameterDescriptors() {
    return PARAMS;
  }
}

registerProcessor("ArpProcessor", ArpProcessor);
