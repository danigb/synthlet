import { toWorkletParams } from "../worklet-utils";
import { Mika, MikaParams } from "./mika";

const IMPULSE_PARAMS = toWorkletParams(MikaParams);

export class MikaWorklet extends AudioWorkletProcessor {
  mika: Mika;

  constructor() {
    super();
    this.mika = new Mika(sampleRate);
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: any
  ) {
    const wave = parameters.wave[0];
    const frequency = parameters.frequency[0];
    const detune = parameters.detune[0];
    this.mika.setParams(wave, frequency, detune);
    const output = outputs[0];
    for (let i = 0; i < output.length; i++) {
      this.mika.fillAudio(output[i]);
    }
    return true;
  }

  static get parameterDescriptors() {
    return IMPULSE_PARAMS;
  }
}

registerProcessor("MikaWorklet", MikaWorklet);
