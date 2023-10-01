import { ParamsDef } from "../worklet-utils";
import { TWO_PI, blep, pulse } from "./math";

export enum WaveformType {
  Sine = 0,
  Triangle = 1,
  Saw = 2,
  Square = 3,
  Pulse = 4,
  Noise = 5,
}

export const MikaParams: ParamsDef = {
  wave: { min: 0, max: 5, defaultValue: 1 },
  freq: { min: 0, max: 10000, defaultValue: 440 },
  detune: { min: -100, max: 100, defaultValue: 0.01 },
} as const;

export class Mika {
  osc: Oscillator;

  constructor(public readonly sampleRate: number) {
    this.osc = new Oscillator(sampleRate);
  }

  setParams(wave: number, freq: number, detune: number) {
    this.osc.setParams(wave, freq);
  }

  fillAudio(buffer: Float32Array) {
    this.osc.fillAudio(buffer, 1.0, false);
    // this.osc2.fillAudio(buffer, 0.3, true);
    // this.osc3.fillAudio(buffer, 0.3, true);
  }
}

/**
 * @private Exported for testing only
 */
export class Oscillator {
  freq: number;
  waveformType: WaveformType;
  dt: number;
  phase: number;
  private triLast = 0.0;
  private triCurrent = 0.0;
  private noiseValue = 19.1919191919191919191919191919191919191919;

  constructor(public readonly sampleRate: number) {
    this.dt = 1.0 / sampleRate;
    this.phase = 0;
  }

  setParams(waveformType: WaveformType, freq: number) {
    this.waveformType = waveformType;
    this.freq = freq;
  }

  fillAudio(buffer: Float32Array, gain: number, mix: boolean) {
    let phase = this.phase;
    const phaseInc = this.freq * this.dt;
    for (let i = 0; i < buffer.length; i++) {
      const out = gain * this.process(phase, phaseInc);
      buffer[i] = mix ? buffer[i] + out : out;
      phase += phaseInc;
      if (phase >= 1) phase -= 1;
    }
    this.phase = phase;
  }

  process(phase: number, phaseInc: number): number {
    switch (this.waveformType) {
      case WaveformType.Sine:
        return Math.sin(this.phase * TWO_PI);
      case WaveformType.Triangle:
        this.triLast = this.triCurrent;
        this.triCurrent =
          phaseInc * pulse(this.phase, phaseInc, 0.5) +
          (1.0 - phaseInc) * this.triLast;
        return this.triCurrent * 5.0;
      case WaveformType.Saw:
        return 1.0 - 2.0 * this.phase + blep(this.phase, phaseInc);
      case WaveformType.Square:
        return pulse(this.phase, phaseInc, 0.5);
      case WaveformType.Pulse:
        return pulse(this.phase, phaseInc, 0.75);
      case WaveformType.Noise:
        // Ove Karlsen's noise algorithm
        // http://musicdsp.org/showArchiveComment.php?ArchiveID=217
        this.noiseValue += 19.0;
        this.noiseValue *= this.noiseValue;
        this.noiseValue -= Math.floor(this.noiseValue);
        return this.noiseValue - 0.5;
      default:
        return 0.0;
    }
  }
}
