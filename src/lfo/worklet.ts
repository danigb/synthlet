import { toWorkletParams } from "../worklet-utils";
import { Lfo, LfoParamsDef } from "./lfo";

const DESCRIPTORS = toWorkletParams(LfoParamsDef);

export class LfoWorklet extends AudioWorkletProcessor {
  lfo: Lfo;

  constructor() {
    super();
    this.lfo = new Lfo(sampleRate);
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: any
  ) {
    this.lfo.setWaveform(parameters.waveform[0]);
    this.lfo.setFrequency(parameters.frequency[0]);
    this.lfo.setGain(parameters.gain[0]);
    const output = outputs[0];
    for (let i = 0; i < output.length; i++) {
      this.lfo.fillControlBuffer(output[i]);
    }
    return true;
  }

  static get parameterDescriptors() {
    return DESCRIPTORS;
  }
}

registerProcessor("LfoWorklet", LfoWorklet);
