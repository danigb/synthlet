import { createArpeggiator } from "./dsp";

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
      params.type[0],
      params.baseNote[0],
      params.chord[0],
      params.octaves[0]
    );
    const output = outputs[0][0];
    if (output) output.fill(note);
    return this.r;
  }

  static get parameterDescriptors() {
    return [
      ["trigger", 0, 0, 1],
      ["type", 0, 0, 1],
      ["baseNote", 60, 0, 200],
      ["chord", 1, 1, 2047],
      ["octaves", 1, 1, 10],
    ].map(([name, defaultValue, minValue, maxValue]) => ({
      name,
      defaultValue,
      minValue,
      maxValue,
      automationRate: "k-rate",
    }));
  }
}

registerProcessor("ArpProcessor", ArpProcessor);
