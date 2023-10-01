import { Clock } from "../shared/clock";
import { bipolar } from "../shared/math";
import { ParamsDef } from "../worklet-utils";

export enum OscWaveform {
  Square,
  Sawtooth,
  SawAndSquare,
}

export const OscParams: ParamsDef = {
  frequency: { min: 0, max: 10000, defaultValue: 1 },
  mix: { min: 0, max: 1, defaultValue: 0.5 },
  pulseWidth: { min: 0, max: 1, defaultValue: 0.5 },
} as const;

/**
 * Simple Blit2 oscillator with variable pulse width.
 */
export class Osc {
  oscClock: Clock;
  waveform: OscWaveform;
  mix: number;
  pulseWidth: number;

  constructor(public readonly sampleRate: number) {
    this.oscClock = new Clock(sampleRate);
    this.waveform = OscWaveform.Sawtooth;
    if (this.waveform === OscWaveform.Sawtooth) {
      this.oscClock.mcounter = 0.5;
    }
    this.mix = OscParams.mix.defaultValue;
    this.pulseWidth = OscParams.pulseWidth.defaultValue;
  }

  update(waveform: OscWaveform, frequency: number, mix: number) {
    this.waveform = waveform;
    this.oscClock.setFrequency(frequency);
    this.mix = mix;
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

  private render(): number {
    const saw1 = renderSaw(this.oscClock);
    if (this.waveform === OscWaveform.Sawtooth) {
      return saw1;
    }
    this.oscClock.addPhaseOffset(this.pulseWidth, true);
    const saw2 = renderSaw(this.oscClock);
    const dcCorrection =
      this.pulseWidth < 0.5
        ? 1.0 / (1.0 - this.pulseWidth)
        : 1.0 / this.pulseWidth;
    const square = (0.5 * saw1 - 0.5 * saw2) * dcCorrection;
    this.oscClock.removePhaseOffset();

    if (this.waveform === OscWaveform.Square) {
      return square;
    } else if (this.waveform === OscWaveform.SawAndSquare) {
      return saw1 * (1.0 - this.mix) + square * this.mix;
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
