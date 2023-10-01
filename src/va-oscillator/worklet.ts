import { toWorkletParams } from "../worklet-utils";
import { VaOscillator, VaOscillatorParams } from "./va-oscillator";

const PARAM_DESCRIPTORS = toWorkletParams(VaOscillatorParams);

export class VaOscillatorWorklet extends AudioWorkletProcessor {
  oscillator: VaOscillator;

  constructor() {
    super();
    this.oscillator = new VaOscillator(sampleRate);
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: any
  ) {
    this.oscillator.setParams(
      parameters.waveform[0],
      parameters.frequency[0],
      parameters.pulseWidth[0],
      parameters.mix[0]
    );
    const output = outputs[0];
    this.oscillator.renderAudio(output);
    return true;
  }

  static get parameterDescriptors() {
    return PARAM_DESCRIPTORS;
  }
}

registerProcessor("VaOscillatorWorklet", VaOscillatorWorklet);
