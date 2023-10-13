import { toWorkletParams } from "../worklet-utils";
import { PARAMS, WtOscillator } from "./wt-oscillator";

const PARAM_DESCRIPTORS = toWorkletParams(PARAMS);

export class WtOscillatorWorklet extends AudioWorkletProcessor {
  p: ReturnType<typeof WtOscillator>;
  d: boolean;

  constructor() {
    super();
    this.d = false;
    this.p = WtOscillator(sampleRate);
    this.port.onmessage = (event) => {
      switch (event.data.type) {
        case "DISCONNECT":
          this.d = true;
          break;
        case "WAVE_TABLE":
          this.p.setWavetable(
            event.data.data,
            event.data.wavetableLength ?? 256
          );
          break;
      }
    };
  }

  process(
    _inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: any
  ) {
    if (this.d) {
      return false;
    }
    this.p.setParams(parameters);
    this.p.fillAudioMono(outputs[0][0]);
    return true;
  }

  static get parameterDescriptors() {
    return PARAM_DESCRIPTORS;
  }
}

registerProcessor("WtOscillatorWorklet", WtOscillatorWorklet);
