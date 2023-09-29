import { Adsr, AdsrParams } from "./adsr";

// const PARAMS = [
//   ["gate", 0, 0, 1, 1],
//   ["attack", 0.5, 0.5, 1000.0],
//   ["decay", 100.0, 0.5, 1000.0],
//   ["sustain", 1.0, 0.0, 1.0],
//   ["release", 925.0, 0.5, 1000.0],
// ].map(([name, defaultValue, minValue, maxValue]) => ({
//   name,
//   defaultValue,
//   minValue,
//   maxValue,
//   automationRate: "k-rate",
// }));

const ADSR_PARAMS = Object.keys(AdsrParams).map((name) => {
  const { min: minValue, max: maxValue, defaultValue } = AdsrParams[name];
  return { name, minValue, maxValue, defaultValue, automationRate: "k-rate" };
});

export class AdsrWorklet extends AudioWorkletProcessor {
  dt: number;
  adsr: Adsr;

  constructor() {
    super();
    this.adsr = new Adsr(sampleRate);
  }
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: any
  ) {
    const gate = parameters.gate[0];

    const input = inputs[0];
    const output = outputs[0];
    const channels = Math.min(input.length, output.length);
    if (channels === 0) return true;

    this.adsr.process(gate, input, output);

    return true;
  }

  static get parameterDescriptors() {
    return ADSR_PARAMS;
  }
}

registerProcessor("AdsrWorklet", AdsrWorklet);
