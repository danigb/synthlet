import { ParamsDef, toWorkletParams } from "../worklet-utils";
import { KarplusStrongOscillator } from "./karplus-strong-oscillator";

export const KarplusStrongOscillatorParams: ParamsDef = {
  gate: { min: 0, max: 1, defaultValue: 0 },
  frequency: { min: 0, max: 10000, defaultValue: 1 },
} as const;
const IMPULSE_PARAMS = toWorkletParams(KarplusStrongOscillatorParams);

export class KarplusStrongOscillatorWorklet extends AudioWorkletProcessor {
  osc: KarplusStrongOscillator;

  constructor() {
    super();
    this.osc = new KarplusStrongOscillator();
    this.osc.reset(sampleRate);
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: any
  ) {
    const gate = parameters.gate[0];
    const freq = parameters.freq[0];
    this.osc.setParams(gate, freq);
    const output = outputs[0];
    for (let ch = 0; ch < output.length; ch++) {
      for (let i = 0; i < output[ch].length; i++) {
        output[ch][i] = this.osc.process();
      }
    }

    return true;
  }

  static get parameterDescriptors() {
    return IMPULSE_PARAMS;
  }
}

registerProcessor(
  "KarplusStrongOscillatorWorklet",
  KarplusStrongOscillatorWorklet
);
