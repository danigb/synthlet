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
    const output = outputs[0][0];
    if (!output) return this.r;

    const trigger = params.trigger;
    const baseNote = params.baseNote[0];
    const scale = params.scale[0];
    const octaves = params.octaves[0];

    if (trigger.length > 1) {
      // The split write, one sample at a time: the previous note up to the
      // trigger's sample and the new note from it. `createArpeggiator` caches
      // the note-to-frequency conversion, so the 127 samples that change
      // nothing cost a comparison each.
      for (let i = 0; i < output.length; i++) {
        output[i] = this.a(trigger[i], baseNote, scale, octaves);
      }
    } else {
      output.fill(this.a(trigger[0], baseNote, scale, octaves));
    }

    return this.r;
  }

  static get parameterDescriptors() {
    return PARAMS;
  }
}

registerProcessor("ArpProcessor", ArpProcessor);
