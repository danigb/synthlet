import { createChorus } from "./dsp";

export class ChorusProcessor extends AudioWorkletProcessor {
  r: boolean; // running
  u: ReturnType<typeof createChorus>["update"];
  g: ReturnType<typeof createChorus>["compute"];

  constructor() {
    super();
    this.r = true;
    const { compute, update } = createChorus(sampleRate);
    this.u = update;
    this.g = compute;
    this.port.onmessage = (event) => {
      switch (event.data.type) {
        case "DISPOSE":
          this.r = false;
          break;
      }
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], params: any) {
    if (inputs[0].length === 0) return this.r;

    this.u(
      params.delay[0],
      params.rate[0],
      params.depth[0],
      params.deviation[0]
    );
    const input = inputs[0][0];
    const outputL = outputs[0][0];
    const outputR = outputs[0][1];
    this.g(input, outputL, outputR);
    return this.r;
  }

  static get parameterDescriptors() {
    return [
      ["delay", 0.5, 0, 1],
      ["rate", 0.5, 0, 1],
      ["depth", 0.5, 0, 1],
      ["deviation", 0.5, 0, 1],
    ].map(([name, defaultValue, minValue, maxValue]) => ({
      name,
      defaultValue,
      minValue,
      maxValue,
      automationRate: "k-rate",
    }));
  }
}

registerProcessor("ChorusProcessor", ChorusProcessor);
