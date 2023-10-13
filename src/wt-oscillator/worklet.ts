import { toWorkletParams } from "../worklet-utils";
import { WtOscillator, WtOscillatorParamsDef } from "./wt-oscillator";

const PARAM_DESCRIPTORS = toWorkletParams(WtOscillatorParamsDef);

export class WtOscillatorWorklet extends AudioWorkletProcessor {
  p: ReturnType<typeof WtOscillator>;
  s: number;
  stop: boolean;

  constructor() {
    super();
    this.s = 0;
    this.stop = false;
    this.p = WtOscillator(sampleRate);
    this.port.onmessage = (event) => {
      switch (event.data.type) {
        case "STOP":
          this.stop = true;
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
    if (this.stop) {
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
