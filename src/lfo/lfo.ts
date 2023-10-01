import { Clock } from "../utils/clock";
import { FadeInModulator } from "../utils/fade-in-modulator";
import {
  PI,
  TWO_PI,
  bipolar,
  concaveXForm,
  parabolicSine,
} from "../utils/math";
import { Timer } from "../utils/timer";
import { ParamsDef } from "../worklet-utils";

export enum LfoWaveform {
  Triangle = 0,
  Sin = 1,
  RampUp = 2,
  RampDown = 3,
  ExpRampUp = 4,
  ExpRampDown = 5,
  ExpTriangle = 6,
  Square = 7,
  RandSampleHold = 8,
  Pluck = 9,
}

enum LfoMode {
  Sync,
  OneShot,
  FreeRun,
}

export const LfoParams: ParamsDef = {
  freq: { min: 0.02, max: 200, defaultValue: 10 },
};

export class Lfo {
  // --- sample rate
  out = 0.0; ///< current output,
  rshOutputValue = 0.0; ///< current output,

  // --- timebase
  lfoClock: Clock; ///< timbase

  // --- for one shot renders
  renderComplete = false; ///< flag for one-shot
  noiseGen: NoiseGenerator; ///< for noise based LFOs
  sampleHoldTimer: Timer; ///< for sample and hold waveforms
  fadeInModulator: FadeInModulator;

  // --- timer for delay
  delayTimer: Timer; ///< LFO turn on delay

  params = {
    frequencyHz: 10,
    waveform: LfoWaveform.Triangle,
    mode: LfoMode.Sync,
  };

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
    this.lfoClock.setFrequency(LfoParams.freq.defaultValue);

    // --- to setup correct start phases, avoid clicks
    switch (this.params.waveform) {
      case LfoWaveform.Triangle:
        this.lfoClock.addPhaseOffset(0.25);
        break;

      case LfoWaveform.RampUp:
      case LfoWaveform.RampDown:
        this.lfoClock.addPhaseOffset(0.5);
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
    output[0] = this.render();
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
      case LfoWaveform.Sin:
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
        throw Error(`Unknown waveform ${this.params.waveform}`);
    }

    // Fade in
    if (this.fadeInModulator.active) {
      out *= this.fadeInModulator.value;
      this.fadeInModulator.tick();
    }
    // TODO: quantize
    // TODO: shape
    // TODO: amplitude
    return out;
  }

  update(waveform: LfoWaveform, frequencyHz: number) {
    this.params.frequencyHz = frequencyHz;
    this.lfoClock.setFrequency(frequencyHz);
    /*
    	// --- update the sampleHoldTimer; this will NOT reset the timer
		if (parameters->waveformIndex == enumToInt(LFOWaveform::kRSH))
			sampleHoldTimer.setExpireSamples(uint32_t(sampleRate / newFrequency_Hz));

		// --- update the delay timer; this will NOT reset the timer
		if (!delayTimer.timerExpired())
		{
			double delay = getModKnobValueLinear(parameters->modKnobValue[MOD_KNOB_B], 0.0, MAX_LFO_DELAY_MSEC);
			delayTimer.setExpireSamples(msecToSamples(sampleRate, delay));
		}

		if (fadeInModulator.isActive() && delayTimer.timerExpired())
		{
			double fadeIn_mSec = getModKnobValueLinear(parameters->modKnobValue[MOD_KNOB_C], 0.0, MAX_LFO_FADEIN_MSEC);
			fadeInModulator.setModTime(fadeIn_mSec, processInfo.sampleRate);
		}
     */
  }
}
