import { ParamsDef, toWorkletParams } from "../worklet-utils";
import { Adsr } from "./adsr";

export const AdsrParams: ParamsDef = {
  gate: { min: 0, max: 1, defaultValue: 0 },
  attack: { min: 0, max: 10, defaultValue: 0.01 },
  decay: { min: 0, max: 10, defaultValue: 0.1 },
  sustain: { min: 0, max: 1, defaultValue: 0.5 },
  release: { min: 0, max: 10, defaultValue: 0.3 },
} as const;

const PARAMS_DESCRIPTORS = toWorkletParams(AdsrParams);

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
    this.adsr.setGate(gate);
    this.adsr.setParams(
      parameters.attack[0],
      parameters.decay[0],
      parameters.sustain[0],
      parameters.release[0]
    );

    const input = inputs[0];
    const output = outputs[0];
    const channels = Math.min(input.length, output.length);
    if (channels === 0) return true;
    const length = input[0].length;

    for (let i = 0; i < length; i++) {
      for (let j = 0; j < channels; j++) {
        output[j][i] = input[j][i] * this.adsr.process();
      }
    }

    return true;
  }

  static get parameterDescriptors() {
    return PARAMS_DESCRIPTORS;
  }
}

registerProcessor("AdsrWorklet", AdsrWorklet);
