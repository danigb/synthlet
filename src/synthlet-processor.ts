import { SynthletVoice } from "./synthlet-voice";

export class SynthletProcessor extends AudioWorkletProcessor {
  voice: SynthletVoice;
  dt: number;
  started: boolean;

  constructor() {
    super();
    this.voice = new SynthletVoice();
    this.dt = 1 / sampleRate;
    this.port.postMessage("SynthletProcessor 05 ready: " + this.dt);
    this.started = false;
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: any
  ) {
    const trigger = parameters.trigger[0];
    if (trigger !== 0 && !this.started) {
      this.started = true;
      this.port.postMessage("start: " + trigger);
      this.voice.start();
    } else if (trigger === 0 && this.started) {
      this.port.postMessage("release: " + trigger);
      this.started = false;
      this.voice.release();
    }

    const note = parameters.note[0];
    this.voice.note = note;

    // mono output
    const output = outputs[0][0];
    for (let i = 0; i < output.length; i++) {
      output[i] = this.voice.process(this.dt);
    }
    return true;
  }

  static get parameterDescriptors() {
    return [
      {
        name: "trigger",
        defaultValue: 0,
        minValue: 0,
        maxValue: 1,
        automationRate: "k-rate",
      },
      {
        name: "note",
        defaultValue: 60,
        minValue: 0,
        maxValue: 127,
        automationRate: "k-rate",
      },
    ];
  }
}

registerProcessor("SynthletProcessor", SynthletProcessor);
