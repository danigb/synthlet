import { SynthletVoice } from "./synthlet-voice";

export class SynthletProcessor extends AudioWorkletProcessor {
  voice: SynthletVoice;
  dt: number;

  constructor() {
    super();
    this.voice = new SynthletVoice();
    this.dt = 1 / sampleRate;
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: any
  ) {
    const trigger = parameters.trigger[0];
    if (trigger === 1) this.voice.start();
    else if (trigger === 0) this.voice.release();

    const note = parameters.note[0];
    this.voice.note = note;

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
  static get parameterDescriptorsOther() {
    return [
      ["bandwidth", 0.9999, 0, 1, "k-rate"],
      ["inputDiffusion1", 0.75, 0, 1, "k-rate"],
      ["inputDiffusion2", 0.625, 0, 1, "k-rate"],
      ["decay", 0.5, 0, 1, "k-rate"],
      ["decayDiffusion1", 0.7, 0, 0.999999, "k-rate"],
      ["decayDiffusion2", 0.5, 0, 0.999999, "k-rate"],
      ["damping", 0.005, 0, 1, "k-rate"],
      ["excursionRate", 0.5, 0, 2, "k-rate"],
      ["excursionDepth", 0.7, 0, 2, "k-rate"],
      ["wet", 1.0, 0, 1, "k-rate"],
      ["dry", 0.0, 0, 1, "k-rate"],
    ].map(
      (x) =>
        new Object({
          name: x[0],
          defaultValue: x[1],
          minValue: x[2],
          maxValue: x[3],
          automationRate: x[4],
        })
    );
  }
}

registerProcessor("synthlet-worklet", SynthletProcessor);
