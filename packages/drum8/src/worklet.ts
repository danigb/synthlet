import { createInstrument } from "./instruments";

export class Drum8WorkletProcessor extends AudioWorkletProcessor {
  r: boolean; // running
  t: number; // type
  g: (output: Float32Array, params: any) => void;

  constructor(options: any) {
    super();
    this.r = true;
    this.t = 0;
    this.g = createInstrument(this.t);
    this.port.onmessage = (event) => {
      switch (event.data.type) {
        case "DISPOSE":
          this.r = false;
          break;
      }
    };
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: any
  ) {
    if (this.t !== parameters.type[0]) {
      this.g = createInstrument(parameters.type[0]);
    }
    this.g(outputs[0][0], parameters);
    return this.r;
  }

  static get parameterDescriptors() {
    const ATTACK = 0.01;
    const DECAY = 0.5;
    return [
      ["gate", 0, 0, 1],
      ["attack", ATTACK, 0, 2],
      ["decay", DECAY, 0, 10],
      ["level", 0.8, 0, 1],
      ["snap", 0.2, 0, 1],
      ["tone", 0.2, 0, 1],
    ].map(([name, defaultValue, minValue, maxValue]) => ({
      name,
      defaultValue,
      minValue,
      maxValue,
      automationRate: "k-rate",
    }));
  }
}

registerProcessor("Drum8WorkletProcessor", Drum8WorkletProcessor);
