import { DriftModulator } from "../dsp/drift-mod";
import { Oscillator, WaveformType } from "../dsp/oscillator";
import { MikaParamName, MikaParams } from "./mika-params";
import { MikaVoice } from "./mika-voice";

export class MikaSynth {
  voice: MikaVoice;
  params: MikaParams;

  // Global modulators
  lfo: Oscillator;
  drift: DriftModulator;

  constructor(params: MikaParams) {
    this.params = params;
    this.voice = new MikaVoice(params);
    this.lfo = new Oscillator(WaveformType.Sine);
    this.drift = new DriftModulator();
  }

  setParams(params: MikaParams) {
    this.params = params;
    Object.keys(params).forEach((name) =>
      this.setParam(name as MikaParamName, params[name])
    );
  }

  setParam(paramName: MikaParamName, value: number) {
    this.voice.setParam(paramName, value);
  }

  start() {
    this.voice.start();
  }

  release() {
    this.voice.release();
  }

  setNote(note: number) {
    this.voice.setNote(note);
  }

  process(dt: number) {
    const lfo = this.lfo.process(dt, this.params.kLfoFrequency);
    const drift = this.drift.process(dt);
    const output = this.voice.process(dt, lfo, drift);

    return output * this.params.kMasterVolume;
  }
}
