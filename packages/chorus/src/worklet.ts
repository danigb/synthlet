import { createChorus } from "./dsp";

export class ChorusProcessor extends AudioWorkletProcessor {
  r: boolean; // running
  g: ReturnType<typeof createChorus>["compute"];

  constructor() {
    super();
    this.r = true;
    const { compute } = createChorus(sampleRate);
    this.g = compute;
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
    if (inputs[0].length === 0) return this.r;
    const input = inputs[0][0];
    const outputL = outputs[0][0];
    const outputR = outputs[0][1];
    this.g(input, outputL, outputR);
    return this.r;
  }

  static get parameterDescriptors() {
    return [["trigger", 0, 0, 1]].map(
      ([name, defaultValue, minValue, maxValue]) => ({
        name,
        defaultValue,
        minValue,
        maxValue,
        automationRate: "k-rate",
      })
    );
  }
}

registerProcessor("ChorusProcessor", ChorusProcessor);
