import { toWorkletParams } from "../worklet-utils";
import { WtOscillator, WtOscillatorParamsDef } from "./wt-oscillator";

const PARAM_DESCRIPTORS = toWorkletParams(WtOscillatorParamsDef);

export class WtOscillatorWorklet extends AudioWorkletProcessor {
  p: ReturnType<typeof WtOscillator>;

  constructor() {
    super();
    this.p = WtOscillator(sampleRate);
    this.port.onmessage = (event) => {
      if (event.data.type === "WAVE_TABLE") {
        const buffer = event.data.buffer;
        const len = event.data.wavetableLength ?? 256;
        this.p.setBuffer(buffer, len);
        this.port.postMessage({
          type: "WT RECEIVED",
          len: event.data.buffer.length,
        });
      }
    };
  }

  process(
    _inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: any
  ) {
    this.p.setParams(parameters);
    this.p.fillAudioMono(outputs[0][0]);
    return true;
  }

  static get parameterDescriptors() {
    return PARAM_DESCRIPTORS;
  }
}

registerProcessor("WtOscillatorWorklet", WtOscillatorWorklet);
