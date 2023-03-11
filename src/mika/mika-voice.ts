import { Filter } from "../dsp/filter";
import { pitchFactor, pitchToFrequency } from "../dsp/math";
import { Oscillator, WaveformType } from "../dsp/oscillator";
import { MikaEnvelope } from "./mika-envelope";
import { MikaParamName, MikaParams } from "./mika-params";

export class MikaVoice {
  osc1a: Oscillator;
  osc1b: Oscillator;
  osc2a: Oscillator;
  osc2b: Oscillator;
  oscFm: Oscillator;
  modEnv: MikaEnvelope;
  volEnv: MikaEnvelope;
  lfoEnv: MikaEnvelope;
  filter: Filter;
  note = 69;
  targetFrequency = 440.0;
  baseFrequency = 440.0;
  pitchBendFactor = 1.0;
  velocity = 1.0;
  osc1PitchFactor = 1.0;
  osc1SplitFactorA = 1.0;
  osc1SplitFactorB = 1.0;
  osc1bMix = 0.0;
  osc2PitchFactor = 1.0;
  osc2SplitFactorA = 1.0;
  osc2SplitFactorB = 1.0;
  osc2bMix = 0.0;
  filterMix = 0.0;
  params: MikaParams;

  constructor(params: MikaParams) {
    this.osc1a = new Oscillator(params.kOsc1Wave);
    this.osc1b = new Oscillator(params.kOsc1Wave);
    this.osc2a = new Oscillator(params.kOsc1Wave);
    this.osc2b = new Oscillator(params.kOsc2Wave);
    this.oscFm = new Oscillator(WaveformType.Sine);
    this.modEnv = new MikaEnvelope();
    this.volEnv = new MikaEnvelope();
    this.lfoEnv = new MikaEnvelope();
    this.filter = new Filter();
    this.params = params;
  }

  setParam(paramName: MikaParamName, value: number) {
    this.params[paramName] = value;
  }

  start() {
    this.volEnv.start();
    this.modEnv.start();
    this.lfoEnv.start();
  }

  release() {
    this.volEnv.release();
    this.modEnv.release();
    this.lfoEnv.release();
  }

  setNote(note: number) {
    this.note = note;
    this.targetFrequency = pitchToFrequency(note);
  }

  getNote(): number {
    return this.note;
  }

  process(dt: number, lfoValue: number, driftValue: number): number {
    const p = this.params;

    // update envelopes
    this.volEnv.update(p.kVolEnvA, p.kVolEnvD, p.kVolEnvS, p.kVolEnvR);
    this.modEnv.update(p.kModEnvA, p.kModEnvD, p.kModEnvS, p.kModEnvR);
    this.lfoEnv.update(p.kLfoDelay, 0.5, 1.0, 0.5);
    this.volEnv.process(dt);
    this.modEnv.process(dt);
    this.lfoEnv.process(dt);
    const volEnvValue = this.volEnv.withVelocity(p.kVolEnvV, this.velocity);
    const modEnvValue = this.modEnv.withVelocity(p.kModEnvV, this.velocity);

    // skip processing if voice is silent
    // if (volEnvValue === 0.0 && this.filter.isSilent()) return 0.0;

    // apply lfo delay
    lfoValue *= this.lfoEnv.withVelocity(0.0, this.velocity);

    // glide to target frequency (for mono and legato modes)
    const glideSpeed = p.kGlideEnabled === 1 ? p.kGlideSpeed : 0.1;
    this.baseFrequency +=
      (this.targetFrequency - this.baseFrequency) * glideSpeed * dt;

    // smooth oscillator split
    const osc1bEnabled =
      p.kOsc1Split !== 0.0 && this.osc1b.waveform !== WaveformType.Noise;
    const osc2bEnabled =
      p.kOsc2Split !== 0.0 && this.osc2b.waveform !== WaveformType.Noise;
    this.osc1bMix += ((osc1bEnabled ? 1.0 : 0.0) - this.osc1bMix) * 100.0 * dt;
    this.osc2bMix += ((osc2bEnabled ? 1.0 : 0.0) - this.osc2bMix) * 100.0 * dt;

    // calculate oscillator base frequencies
    let osc1Frequency =
      this.baseFrequency *
      this.osc1PitchFactor *
      this.pitchBendFactor *
      (1.0 + driftValue);
    if (p.kLfoAmount < 0.0)
      osc1Frequency *= 1.0 + Math.abs(p.kLfoAmount) * lfoValue;
    let osc2Frequency =
      this.baseFrequency *
      this.osc2PitchFactor *
      this.pitchBendFactor *
      (1.0 + driftValue);
    osc2Frequency *= 1.0 + Math.abs(p.kLfoAmount) * lfoValue;

    // fm
    switch (p.kFmMode) {
      case 1:
      case 2: {
        let fmAmount =
          p.kFmCoarse +
          p.kFmFine +
          p.kVolEnvFm * volEnvValue +
          p.kModEnvFm * modEnvValue +
          p.kLfoFm * lfoValue;
        let fmValue = pitchFactor(
          this.oscFm.process(dt, osc1Frequency) * fmAmount
        );
        switch (p.kFmMode) {
          case 1:
            osc1Frequency *= fmValue;
            break;
          case 2:
            osc2Frequency *= fmValue;
            break;
        }
        break;
      }
    }

    let out = 0;

    // oscillator 1
    let osc1Out = 0.0;
    if (p.kOscMix < 0.99) {
      osc1Out += this.osc1a.process(dt, osc1Frequency * this.osc1SplitFactorA);
      if (this.osc1bMix > 0.01)
        osc1Out +=
          this.osc1bMix *
          this.osc1b.process(dt, osc1Frequency * this.osc1SplitFactorB);
      out += osc1Out * Math.sqrt(1.0 - p.kOscMix);
    }

    // oscillator 2
    let osc2Out = 0.0;
    if (p.kOscMix > 0.01) {
      osc2Out += this.osc2a.process(dt, osc2Frequency * this.osc2SplitFactorA);
      if (this.osc2bMix > 0.01)
        osc2Out +=
          this.osc2bMix *
          this.osc2b.process(dt, osc2Frequency * this.osc2SplitFactorB);
      out += osc2Out * Math.sqrt(p.kOscMix);
    }

    // Apply volume envelope
    out *= volEnvValue;

    // Apply filter
    this.filterMix +=
      ((p.kFilterEnabled ? 1.0 : 0.0) - this.filterMix) * 100.0 * dt;
    if (this.filterMix > 0.01) {
      const cutoff = this._getFilterCutoff(
        volEnvValue,
        modEnvValue,
        lfoValue,
        driftValue
      );
      const filterOut = this.filter.process(
        dt,
        out,
        cutoff,
        p.kFilterResonance
      );
      out = out * (1.0 - this.filterMix) + filterOut * this.filterMix;
    }

    return out;
  }

  private _getFilterCutoff(
    volEnvValue: number,
    modEnvValue: number,
    lfoValue: number,
    driftValue: number
  ) {
    const p = this.params;
    let cutoff = p.kFilterCutoff;
    cutoff *= 1.0 + driftValue;
    cutoff += p.kVolEnvCutoff * volEnvValue;
    cutoff += p.kModEnvCutoff * modEnvValue;
    cutoff += lfoValue * p.kLfoCutoff;
    cutoff += p.kFilterKeyTrack * this.baseFrequency * this.pitchBendFactor;
    return cutoff;
  }
}
