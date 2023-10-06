import { toWorkletParams } from "../worklet-utils";
import { PcmOscillator, PcmOscillatorParams } from "./pcm-oscillator";

const PARAM_DESCRIPTORS = toWorkletParams(PcmOscillatorParams);

export class PcmOscillatorWorklet extends AudioWorkletProcessor {
  p: ReturnType<typeof PcmOscillator>;

  constructor() {
    super();
    this.p = PcmOscillator(sampleRate);
    this.port.onmessage = (event) => {
      if (event.data.type === "AUDIO") {
        this.p.setBuffer(event.data.buffer);
        this.port.postMessage({
          type: "RECEIVED",
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
    const gate = parameters.gate[0];
    const speed = parameters.speed[0];
    this.p.setParams(gate, speed);
    const output = outputs[0];
    for (let i = 0; i < output.length; i++) {
      this.p.fillAudioMono(output[i]);
    }
    return true;
  }

  static get parameterDescriptors() {
    return PARAM_DESCRIPTORS;
  }
}

registerProcessor("PcmOscillatorWorklet", PcmOscillatorWorklet);
