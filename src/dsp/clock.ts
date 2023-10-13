/**
 * A Clock is a signal generator that produces 1 at specific frequency
 *
 * @param sampleRate
 */
export class Clock {
  phase: number;
  inc: number;
  init: boolean;

  constructor(public readonly sampleRate: number, public freq: number) {
    this.inc = this.freq / this.sampleRate;
    this.phase = 0;
    this.init = true;
  }

  /**
   * Set the frequency of the clock.
   * @param freq
   */
  set(freq: number) {
    this.freq = Math.abs(freq);
    this.inc = this.freq / this.sampleRate;
  }

  tick() {
    if (this.init) {
      this.init = false;
      return 1;
    }
    this.phase += this.inc;
    if (this.phase >= 1.0) {
      this.phase -= 1.0;
      return 1;
    }
    return 0;
  }
}
