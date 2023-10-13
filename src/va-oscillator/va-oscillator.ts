import { ParamsDef } from "../params-utils";
import { Clock } from "../shared/clock";
import { TWO_PI, bipolar, clamp } from "../shared/math";

export enum VaOscillatorWaveform {
  Sine = 0,
  Triangle = 1,
  Saw = 2,
  Square = 3,
  Pulse = 4,
  Noise = 5,
  Square2 = 6,
  Saw2 = 7,
  SawAndSquare2 = 8,
}

export const VA_OSCILLATOR_WAVEFORM_NAMES = [
  "Sine",
  "Triangle",
  "Saw",
  "Square",
  "Pulse",
  "Noise",
  "Square 2",
  "Saw 2",
  "Saw+Square 2",
];

export const VA_OSCILLATOR_PARAMS = {
  waveform: VaOscillatorWaveform.Triangle,
  frequency: 440,
  pulseWidth: 0.5,
  mix: 0.5,
};

export const VaOscillatorParams: ParamsDef = {
  waveform: { min: 0, max: 8, init: VA_OSCILLATOR_PARAMS.waveform },
  frequency: {
    min: 0,
    max: 10000,
    init: VA_OSCILLATOR_PARAMS.frequency,
  },
  mix: { min: 0, max: 1, init: VA_OSCILLATOR_PARAMS.mix },
  pulseWidth: { min: 0, max: 1, init: VA_OSCILLATOR_PARAMS.pulseWidth },
} as const;

/**
 * A Virtual Analog Blit2 oscillator with variable pulse width.
 */
export class VaOscillator {
  oscClock: Clock;
  params = { ...VA_OSCILLATOR_PARAMS };
  private triLast = 0.0;
  private triCurrent = 0.0;
  private noiseValue = 19.1919191919191919191919191919191919191919;

  constructor(public readonly sampleRate: number) {
    this.oscClock = new Clock(sampleRate);
    if (this.params.waveform === VaOscillatorWaveform.Saw2) {
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
    const { mcounter: phase, phaseInc } = this.oscClock;

    if (params.waveform === VaOscillatorWaveform.Sine) {
      return Math.sin(this.oscClock.mcounter * TWO_PI);
    }
    if (params.waveform === VaOscillatorWaveform.Triangle) {
      this.triLast = this.triCurrent;
      this.triCurrent =
        phaseInc * pulse(phase, phaseInc, 0.5) +
        (1.0 - phaseInc) * this.triLast;
      return this.triCurrent * 5.0;
    }
    if (params.waveform === VaOscillatorWaveform.Saw) {
      return 1.0 - 2.0 * phase + blep(phase, phaseInc);
    }
    if (params.waveform === VaOscillatorWaveform.Square) {
      return pulse(phase, phaseInc, 0.5);
    }
    if (params.waveform === VaOscillatorWaveform.Pulse) {
      return pulse(phase, phaseInc, 0.75);
    }
    if (params.waveform === VaOscillatorWaveform.Noise) {
      // Ove Karlsen's noise algorithm
      // http://musicdsp.org/showArchiveComment.php?ArchiveID=217
      this.noiseValue += 19.0;
      this.noiseValue *= this.noiseValue;
      this.noiseValue -= Math.floor(this.noiseValue);
      return this.noiseValue - 0.5;
    }

    const saw1 = renderSaw(this.oscClock);
    if (params.waveform === VaOscillatorWaveform.Saw2) {
    }
    this.oscClock.addPhaseOffset(params.pulseWidth, true);
    const saw2 = renderSaw(this.oscClock);
    const dcCorrection =
      params.pulseWidth < 0.5
        ? 1.0 / (1.0 - params.pulseWidth)
        : 1.0 / params.pulseWidth;
    const square = (0.5 * saw1 - 0.5 * saw2) * dcCorrection;
    this.oscClock.removePhaseOffset();

    if (params.waveform === VaOscillatorWaveform.Square2) {
      return square;
    } else if (params.waveform === VaOscillatorWaveform.SawAndSquare2) {
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

// http://www.kvraudio.com/forum/viewtopic.php?t=375517
function blep(phase: number, phaseIncrement: number): number {
  if (phase < phaseIncrement) {
    phase /= phaseIncrement;
    return phase + phase - phase * phase - 1.0;
  } else if (phase > 1.0 - phaseIncrement) {
    phase = (phase - 1.0) / phaseIncrement;
    return phase * phase + phase + phase + 1.0;
  }
  return 0.0;
}

function pulse(phase: number, phaseIncrement: number, width: number): number {
  let v = phase < width ? 1.0 : -1.0;
  v += blep(phase, phaseIncrement);
  v -= blep((phase + (1.0 - width)) % 1.0, phaseIncrement);
  return v;
}
