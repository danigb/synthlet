import { Clock } from "../shared/clock";
import { FadeInModulator } from "../shared/fade-in-modulator";
import {
  PI,
  TWO_PI,
  bipolar,
  clamp,
  concaveXForm,
  parabolicSine,
  quantizeBipolarValue,
} from "../shared/math";
import { NoiseGenerator } from "../shared/noise-generator";
import { Timer } from "../shared/timer";
import { ParamsDef } from "../worklet-utils";

export enum LfoWaveform {
  Triangle = 0,
  Sine = 1,
  RampUp = 2,
  RampDown = 3,
  ExpRampUp = 4,
  ExpRampDown = 5,
  ExpTriangle = 6,
  Square = 7,
  RandSampleHold = 8,
  Pluck = 9,
}

export const LFO_WAVEFORM_NAMES = [
  "Triangle",
  "Sine",
  "RampUp",
  "RampDown",
  "ExpRampUp",
  "ExpRampDown",
  "ExpTriangle",
  "Square",
  "RandSampleHold",
  "Pluck",
];

export enum LfoMode {
  Sync,
  OneShot,
  FreeRun,
}

const LFO_PARAMS = {
  waveform: LfoWaveform.Triangle,
  mode: LfoMode.Sync,
  frequency: 10,
  gain: 10,
  quantize: 0,
};

export const LfoParamsDef: ParamsDef = {
  waveform: { min: 0, max: 9, defaultValue: LFO_PARAMS.waveform },
  frequency: { min: 0.02, max: 200, defaultValue: LFO_PARAMS.frequency },
  gain: { min: 0, max: 1000, defaultValue: LFO_PARAMS.gain },
  quantize: { min: 0, max: 1000, defaultValue: LFO_PARAMS.quantize },
};

export class Lfo {
  rshOutputValue = 0.0;

  lfoClock: Clock;
  renderComplete = false;
  noiseGen = new NoiseGenerator();
  sampleHoldTimer: Timer;
  fadeInModulator: FadeInModulator;
  delayTimer: Timer;
  private params = { ...LFO_PARAMS };

  // --- ramp mod for fade-in
  // RampModulator fadeInModulator;		///< LFO fade-in modulator

  constructor(public readonly sampleRate: number) {
    this.fadeInModulator = new FadeInModulator(sampleRate);
    this.lfoClock = new Clock(sampleRate);
    this.sampleHoldTimer = new Timer();
    this.delayTimer = new Timer();

    this.rshOutputValue = this.noiseGen.doWhiteNoise();
    this.renderComplete = false;

    // --- initialize with current value
    this.lfoClock.setFrequency(LfoParamsDef.frequency.defaultValue);

    // --- to setup correct start phases, avoid clicks
    switch (this.params.waveform) {
      case LfoWaveform.Triangle:
        this.lfoClock.addPhaseOffset(0.25, true);
        break;

      case LfoWaveform.RampUp:
      case LfoWaveform.RampDown:
        this.lfoClock.addPhaseOffset(0.5, true);
        break;
    }
  }

  fillAudioBuffer(output: Float32Array) {
    for (let i = 0; i < output.length; i++) {
      output[i] = this.render();
      this.lfoClock.advanceClock(1);
    }
  }

  fillControlBuffer(output: Float32Array) {
    const value = this.render();
    for (let i = 0; i < output.length; i++) {
      output[i] = value;
    }
    this.lfoClock.advanceClock(output.length);
  }

  private render(): number {
    if (this.renderComplete) return 0.0;

    if (!this.delayTimer.timerExpired()) {
      this.delayTimer.advanceTimer();
      return 0.0;
    }

    const wrapped = this.lfoClock.wrapClock();
    if (wrapped && this.params.mode === LfoMode.OneShot) {
      this.renderComplete = true;
      return 0.0;
    }

    let out = 0.0;

    switch (this.params.waveform) {
      case LfoWaveform.Triangle:
        out = 1.0 - 2.0 * Math.abs(bipolar(this.lfoClock.mcounter));
        break;
      case LfoWaveform.Sine:
        const angle = this.lfoClock.mcounter * TWO_PI - PI;
        out = parabolicSine(-angle);
        break;
      case LfoWaveform.RampUp:
        out = bipolar(this.lfoClock.mcounter);
        break;
      case LfoWaveform.RampDown:
        out = -bipolar(this.lfoClock.mcounter);
        break;
      case LfoWaveform.ExpRampUp:
        out = bipolar(concaveXForm(this.lfoClock.mcounter));
        break;
      case LfoWaveform.ExpRampDown:
        out = bipolar(concaveXForm(1 - this.lfoClock.mcounter));
        break;
      case LfoWaveform.ExpTriangle:
        out = bipolar(concaveXForm(Math.abs(bipolar(this.lfoClock.mcounter))));
        break;
      case LfoWaveform.Square:
        out = this.lfoClock.mcounter <= 0.5 ? +1.0 : -1.0;
        break;
      case LfoWaveform.RandSampleHold:
        if (this.sampleHoldTimer.timerExpired()) {
          this.rshOutputValue = this.noiseGen.doWhiteNoise();
          this.sampleHoldTimer.resetTimer();
        } else {
          this.sampleHoldTimer.advanceTimer();
        }
        out = this.rshOutputValue;
        break;

      case LfoWaveform.Pluck:
        // TODO
        break;
      default:
        throw Error("Unknown waveform: " + this.params.waveform);
    }

    // Fade in
    if (this.fadeInModulator.active) {
      out *= this.fadeInModulator.value;
      this.fadeInModulator.tick();
    }

    if (this.params.quantize) {
      out = quantizeBipolarValue(out, this.params.quantize);
    }

    // TODO: shape

    out *= this.params.gain;

    return out;
  }

  setParameters(
    waveform: number,
    frequency: number,
    gain: number,
    quantize: number
  ) {
    this.params.waveform = clamp(
      Math.floor(waveform),
      LfoParamsDef.waveform.min,
      LfoParamsDef.waveform.max
    );
    this.lfoClock.setFrequency(frequency);
    this.params.gain = gain;
    this.params.quantize = Math.floor(quantize);

    if (this.params.waveform === LfoWaveform.RandSampleHold) {
      this.sampleHoldTimer.setExpireSamples(this.sampleRate / frequency);
    }
    // TODO: delay
    // TODO: fade in
    /*
		if (!delayTimer.timerExpired()) {
			double delay = getModKnobValueLinear(parameters->modKnobValue[MOD_KNOB_B], 0.0, MAX_LFO_DELAY_MSEC);
			delayTimer.setExpireSamples(msecToSamples(sampleRate, delay));
		}

		if (fadeInModulator.isActive() && delayTimer.timerExpired()){
			double fadeIn_mSec = getModKnobValueLinear(parameters->modKnobValue[MOD_KNOB_C], 0.0, MAX_LFO_FADEIN_MSEC);
			fadeInModulator.setModTime(fadeIn_mSec, processInfo.sampleRate);
		}
    */
  }
}
