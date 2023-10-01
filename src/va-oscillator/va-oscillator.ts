import { Clock } from "../shared/clock";
import { bipolar, clamp } from "../shared/math";
import { ParamsDef } from "../worklet-utils";

export enum VaOscillatorWaveform {
  Square = 0,
  Sawtooth = 1,
  SawAndSquare = 2,
}

const VA_OSCILLATOR_PARAMS = {
  waveform: VaOscillatorWaveform.Square,
  pulseWidth: 0.5,
  mix: 0.5,
};

export const VaOscillatorParams: ParamsDef = {
  frequency: { min: 0, max: 10000, defaultValue: 1 },
  mix: { min: 0, max: 1, defaultValue: 0.5 },
  pulseWidth: { min: 0, max: 1, defaultValue: 0.5 },
} as const;

/**
 * A Virtual Analog Blit2 oscillator with variable pulse width.
 */
export class VaOscillator {
  oscClock: Clock;
  params = { ...VA_OSCILLATOR_PARAMS };

  constructor(public readonly sampleRate: number) {
    this.oscClock = new Clock(sampleRate);
    if (this.params.waveform === VaOscillatorWaveform.Sawtooth) {
      this.oscClock.mcounter = 0.5;
    }
  }

  setParams(
    waveform: VaOscillatorWaveform,
    frequency: number,
    pulseWidth: number,
    mix: number
  ) {
    this.params.waveform = clamp(Math.floor(waveform), 0, 3);
    this.oscClock.setFrequency(frequency);
    this.params.pulseWidth = clamp(pulseWidth, 0, 1);
    this.params.mix = clamp(mix, 0, 1);
  }

  renderAudio(output: Float32Array[]) {
    if (output.length === 0) return;

    for (let i = 0; i < output[0].length; i++) {
      const sample = this.render();
      this.oscClock.advanceClock(1);
      this.oscClock.wrapClock();
      for (let channel = 0; channel < output.length; channel++) {
        output[channel][i] = sample;
      }
    }
  }

  public render(): number {
    const { params } = this;
    const saw1 = renderSaw(this.oscClock);
    if (params.waveform === VaOscillatorWaveform.Sawtooth) {
      return saw1;
    }
    this.oscClock.addPhaseOffset(params.pulseWidth, true);
    const saw2 = renderSaw(this.oscClock);
    const dcCorrection =
      params.pulseWidth < 0.5
        ? 1.0 / (1.0 - params.pulseWidth)
        : 1.0 / params.pulseWidth;
    const square = (0.5 * saw1 - 0.5 * saw2) * dcCorrection;
    this.oscClock.removePhaseOffset();

    if (params.waveform === VaOscillatorWaveform.Square) {
      return square;
    } else if (params.waveform === VaOscillatorWaveform.SawAndSquare) {
      return saw1 * (1.0 - params.mix) + square * params.mix;
    } else {
      throw new Error("Invalid waveform");
    }
  }
}

export function renderSaw(clock: Clock): number {
  // --- setup output
  // --- first create the trivial saw from modulo counter
  let sawOut: number = bipolar(clock.mcounter);

  // --- setup for BLEP correction
  let blepCorrection: number = 0.0;
  const edgeHeight: number = 1.0;

  blepCorrection = polyBlep2(
    clock.mcounter, // current phase value
    Math.abs(clock.phaseInc), // abs(phaseInc) is for FM synthesis with negative frequencies
    edgeHeight, // sawtooth edge height = 1.0
    true // risingEdge
  );

  // --- add the correction factor
  sawOut += blepCorrection;

  return sawOut;
}

function polyBlep2(
  mcounter: number,
  phaseInc: number,
  height: number,
  risingEdge: boolean
): number {
  // --- return value
  let blepCorrection: number = 0.0;

  // --- LEFT side of discontinuity
  //	   -1 < t < 0
  if (mcounter > 1.0 - phaseInc) {
    // --- calculate distance
    let t: number = (mcounter - 1.0) / phaseInc;

    // --- calculate residual
    blepCorrection = height * (t * t + 2.0 * t + 1.0);
  }
  // --- RIGHT side of discontinuity
  //     0 <= t < 1
  else if (mcounter < phaseInc) {
    // --- calculate distance
    let t: number = mcounter / phaseInc;

    // --- calculate residual
    blepCorrection = height * (2.0 * t - t * t - 1.0);
  }

  // --- subtract for falling, add for rising edge
  if (!risingEdge) blepCorrection *= -1.0;

  return blepCorrection;
}
