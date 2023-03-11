import { MIKA_PARAM_DEFS } from "./mika-params";
import { MikaSynth } from "./mika-synth";

const DEFAULT = {
  name: "Default - Mika",
  params: {
    kOsc1Wave: 2,
    kOsc1Coarse: 0,
    kOsc1Fine: -0.210938,
    kOsc1Split: 0.004883,
    kOsc2Wave: 0,
    kOsc2Coarse: 0,
    kOsc2Fine: 0.0,
    kOsc2Split: -0.005273,
    kOscMix: 0.527778,
    kFmMode: 1,
    kFmCoarse: 4,
    kFmFine: 0.0,
    kFilterEnabled: false,
    kFilterCutoff: 200.0,
    kFilterResonance: 0.953125,
    kFilterKeyTrack: 1.0,
    kVolEnvA: 0.5,
    kVolEnvD: 999.296328,
    kVolEnvS: 0.0,
    kVolEnvR: 99.447572,
    kVolEnvV: 1.0,
    kModEnvA: 0.5,
    kModEnvD: 998.0,
    kModEnvS: 0.0,
    kModEnvR: 998.0,
    kModEnvV: 0.0,
    kLfoAmount: -0.00625,
    kLfoFrequency: 1.723765,
    kLfoDelay: 0.1,
    kVolEnvFm: 0.0,
    kVolEnvCutoff: 0.0,
    kModEnvFm: -5.0625,
    kModEnvCutoff: 0.0,
    kLfoFm: 0.0,
    kLfoCutoff: 0.0,
    kVoiceMode: 0,
    kGlideSpeed: 1.0,
    kMasterVolume: 0.123047,
  },
};

export class MikaWorklet extends AudioWorkletProcessor {
  synth: MikaSynth;
  dt: number;
  started: boolean;
  debug = 0;

  constructor() {
    super();
    this.synth = new MikaSynth(DEFAULT.params);
    this.dt = 1 / sampleRate;
    this.port.postMessage(DEFAULT);
    this.started = false;

    this.port.onmessage = (e) => {
      const { type, params } = e.data;
      if (type === "preset-change") {
        this.synth.setParams(params);
      }
    };
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: any
  ) {
    const trigger = parameters.trigger[0];
    if (trigger !== 0 && !this.started) {
      this.started = true;
      this.synth.start();
    } else if (trigger === 0 && this.started) {
      this.started = false;
      this.synth.release();
    }

    const note = parameters.note[0];
    this.synth.setNote(note);

    // mono output
    const output = outputs[0][0];
    for (let i = 0; i < output.length; i++) {
      output[i] = this.synth.process(this.dt);
    }

    this.debug++;
    if (this.debug === 1000) {
      this.port.postMessage({ type: "debug", debug: output[0] });
      this.debug = 0;
    }
    return true;
  }

  static get parameterDescriptors() {
    const automationRate = "k-rate";
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
      ...MIKA_PARAM_DEFS.map(
        ([name, desc, defaultValue, minValue, maxValue]) => ({
          name,
          defaultValue,
          minValue,
          maxValue,
          automationRate,
        })
      ),
    ];
  }
}

registerProcessor("MikaWorklet", MikaWorklet);
