import { ParamsDef } from "../utils";

export const ImpulseParams: ParamsDef = {
  freq: { min: 0, max: 10000, defaultValue: 1 },
};

/**
 * Impulse produce a series of single-sample impulses at a specified frequency.
 * @see https://paulbatchelor.github.io/sndkit/metro/
 */
export class Impulse {
  sampleRate: number;
  dt: number;
  phase: number;
  freq: number;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    this.dt = 1 / sampleRate;
    this.phase = 1 - this.dt;
    this.freq = 1;
  }

  setParams(freq: number) {
    this.freq = freq;
  }

  fillControl(control: Float32Array) {
    const phase = this.phase + this.dt * this.freq * control.length;
    if (phase >= 1) {
      control[0] = 1;
      this.phase = phase % 1;
    } else {
      control[0] = 0;
      this.phase = phase;
    }
  }

  fillAudio(buffer: Float32Array) {
    let phase = this.phase;
    const length = buffer.length;
    for (let i = 0; i < length; i++) {
      phase += this.dt * this.freq;
      if (phase >= 1) {
        buffer[i] = 1;
        phase -= 1;
      } else {
        buffer[i] = 0;
      }
    }
    this.phase = phase;
  }
}
