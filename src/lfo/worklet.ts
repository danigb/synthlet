import { toWorkletParams } from "../worklet-utils";
import { Lfo, LfoParams, LfoWaveform } from "./lfo";

const LFO_PARAMS = toWorkletParams(LfoParams);

export class LfoWorklet extends AudioWorkletProcessor {
  impulse: Lfo;

  constructor() {
    super();
    this.impulse = new Lfo(sampleRate);
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: any
  ) {
    const freq = parameters.freq[0];
    this.impulse.update(LfoWaveform.Triangle, freq);
    const output = outputs[0];
    for (let i = 0; i < output.length; i++) {
      this.impulse.fillControlBuffer(output[i]);
    }
    return true;
  }

  static get parameterDescriptors() {
    return LFO_PARAMS;
  }
}

registerProcessor("LfoWorklet", LfoWorklet);
