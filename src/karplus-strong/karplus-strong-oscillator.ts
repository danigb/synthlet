import { ParamsDef } from "../worklet-utils";
import { Exciter } from "./exciter/exciter";
import { HighShelfFilter } from "./filters/high-self-filter";
import { LP2Filter } from "./filters/lp2-filter";
import { ParametricFilter } from "./filters/parametric-filter";
import { PluckFilterType, PluckPosFilter } from "./filters/pluck-pos-filter";
import { Resonator } from "./resonator/resonator";

export const KarplusStrongOscillatorParams: ParamsDef = {
  gate: { min: 0, max: 1, def: 0 },
  frequency: { min: 0, max: 10000, def: 1 },
} as const;

function tanhWaveShaper(xn: number, saturation: number): number {
  if (saturation === 0) return xn;
  return Math.tanh(saturation * xn) / Math.tanh(saturation);
}

type KarplusStrongOscillatorParameters = {
  mode: KarplusStrongOscillatorMode;
  decay: number;

  detune: number; // detune
  boost: number; // boost
  bite: number; // bite
  pluckPos: number; // pluck pos
  attackTime_mSec: number;
  holdTime_mSec: number;
  releaseTime_mSec: number;
};

function mapNormLinear(
  normalizedValue: number,
  min: number,
  max: number
): number {
  return (max - min) * normalizedValue + min;
}

export enum KarplusStrongOscillatorMode { // simple enumeration for model choice
  kNylonGtr = 0,
  kDistGtr = 1,
  kBass = 2,
  kSilent = 3,
}

export class KarplusStrongOscillator {
  private midiPitch: number = 0.0; // the midi pitch
  private outputAmplitude: number = 1.0; // amplitude in dB
  private pluckPosition: number = 1; // position: 0 = at nut, 1 = at center of string

  private exciter: Exciter = new Exciter(); // exciter for KS model
  private resonator: Resonator = new Resonator(); // resonator for KS model

  private highShelfFilter: HighShelfFilter = new HighShelfFilter(); // filter for adding bite to exciter
  private bassFilter: LP2Filter = new LP2Filter(); // for bass guitar pickup simulation
  private distortionFilter: LP2Filter = new LP2Filter(); // for soft clip distortion

  private pluckPosFilter: PluckPosFilter = new PluckPosFilter(); // for simulating pluck position with comb filter
  private bodyFilter: ParametricFilter = new ParametricFilter(); // simple parametric filter for adding a resonant hump to th output
  private mode: KarplusStrongOscillatorMode =
    KarplusStrongOscillatorMode.kNylonGtr;
  prevGate: number = 0.0;

  setParams(gate: number, frequency: number) {
    if (gate === 1 && this.prevGate !== 1) {
      this.doNoteOn(frequency);
    }
    this.prevGate = gate;
  }

  reset(sampleRate: number) {
    this.resonator.reset(sampleRate);
    this.exciter.reset(sampleRate);
    this.pluckPosFilter.reset(sampleRate);
    this.highShelfFilter.reset(sampleRate);
    this.bodyFilter.reset(sampleRate);
    this.bassFilter.reset(sampleRate);
    this.bassFilter.setParameters(150.0, 0.707);
    this.distortionFilter.reset(sampleRate);
    this.distortionFilter.setParameters(2000.0, 2.5);
    this.updateParameters({
      mode: KarplusStrongOscillatorMode.kNylonGtr,
      decay: 0.5,
      detune: 0.0,
      boost: 0.0,
      bite: 0.0,
      pluckPos: 0.5,
      attackTime_mSec: 5.0,
      holdTime_mSec: 200.0,
      releaseTime_mSec: 500.0,
    });
  }

  doNoteOn(midiPitch: number) {
    // --- reset
    this.midiPitch = midiPitch;
    this.resonator.flushDelays();
    this.pluckPosFilter.clear();
    this.highShelfFilter.reset(sampleRate);
    this.bassFilter.reset(sampleRate);
    this.bodyFilter.reset(sampleRate);

    // --- start excitation
    this.exciter.startExciter();

    return true;
  }

  doNoteOff() {
    return true;
  }

  process(): number {
    let input = this.exciter.render();
    input = this.highShelfFilter.processAudioSample(input);

    if (this.mode === KarplusStrongOscillatorMode.kNylonGtr) {
      input = this.pluckPosFilter.processAudioSample(
        input,
        PluckFilterType.kPluckAndBridge
      );
    } else if (this.mode === KarplusStrongOscillatorMode.kDistGtr) {
      input = this.pluckPosFilter.processAudioSample(
        input,
        PluckFilterType.kPluckAndPickup
      );
    } else if (this.mode === KarplusStrongOscillatorMode.kBass) {
      input = this.pluckPosFilter.processAudioSample(
        input,
        PluckFilterType.kPluckPickupBridge
      );
    } else if (this.mode === KarplusStrongOscillatorMode.kSilent) {
      input = 0.0;
    }

    // resonate the excitation
    let oscOutput = this.resonator.process(input);

    // VERY simple guitar amp sim
    //
    // this is just a simple overdriven tanh() waveshaper
    // you DEFINITELY want to change this to something that
    // you like better (see my tube addendum here:
    // http://www.willpirkle.com/fx-book-bonus-material/chapter-19-addendum/
    if (this.mode === KarplusStrongOscillatorMode.kDistGtr) {
      // the x10 will add sustain, the 5000.0 will add distortion
      oscOutput = tanhWaveShaper(oscOutput * 10.0, 5000.0); // adjust distortion with 2nd argument

      //// really simple clipping version, no tanh() call
      // oscOutput *= 100.0;
      // boundValue(oscOutput, -0.25, +0.25);
      // oscOutput *= 4.0;

      // drop -6dB to make up for energy
      //
      // note that this will pull out the very high frequency components;
      // you may want to adjust this filter (see reset() function)
      oscOutput = 0.5 * this.distortionFilter.processAudioSample(oscOutput);
      oscOutput *= this.outputAmplitude;
    }
    // TODO: glide modulator
    return oscOutput;
  }

  public updateParameters(params: KarplusStrongOscillatorParameters) {
    const coarseDetune = mapNormLinear(params.detune, -12.0, 12.0);
    // convert midi pitch to frequency
    const oscillatorFrequency =
      440.0 * Math.pow(2.0, (this.midiPitch - 69.0 + coarseDetune) / 12.0);

    const delayLen = this.resonator.setParameters(
      oscillatorFrequency,
      params.decay
    );
    this.pluckPosition = mapNormLinear(params.pluckPos, 10.0, 2.0);
    this.pluckPosFilter.setDelayInSamples(delayLen / this.pluckPosition);

    // --- exciter
    this.exciter.setParameters(
      params.attackTime_mSec,
      params.holdTime_mSec,
      params.releaseTime_mSec
    );

    // --- filters
    const bite_dB = mapNormLinear(params.bite, 0.0, 20.0);
    this.highShelfFilter.setParameters(2000.0, bite_dB);

    // --- boost
    const body_dB = +3.0;

    // --- change body filter resonance based on model
    if (params.mode == KarplusStrongOscillatorMode.kNylonGtr)
      this.bodyFilter.setParameters(400.0, 1.0, body_dB);
    else if (params.mode == KarplusStrongOscillatorMode.kDistGtr)
      this.bodyFilter.setParameters(300.0, 2.0, body_dB);
    else if (params.mode == KarplusStrongOscillatorMode.kBass)
      this.bodyFilter.setParameters(250.0, 1.0, body_dB);

    const output_dB = mapNormLinear(params.boost, 0.0, 20.0);
    this.outputAmplitude = Math.pow(10.0, output_dB / 20.0);

    return true;
  }
}
