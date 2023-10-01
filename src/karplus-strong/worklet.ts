import { toWorkletParams } from "../worklet-utils";
import {
  KarplusStrongOscillator,
  KarplusStrongOscillatorParams,
} from "./karplus-strong-oscillator";

const PARAMS = toWorkletParams(KarplusStrongOscillatorParams);

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
    const freq = parameters.frequency[0];
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
    return PARAMS;
  }
}

registerProcessor(
  "KarplusStrongOscillatorWorklet",
  KarplusStrongOscillatorWorklet
);
