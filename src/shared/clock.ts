import { wrapMinMax } from "./math";

/**
 * Compact modulo counter with wrapping used as the timebase for all oscillators.
 * - the counter member variable is the modulo counter value on the range [0.0, 1.0]
 * - the clock can run forwards or backwards (for negative frequencies)
 * - you may temporarily shift the current phase of the clock forwards or backwards, with modulo wrap
 * to implement phase modulation for the DX synths
 * - functions allow saving the current phase so that the state can be restored after the phase modulation
 *
 * @author Will Pirkle http://www.willpirkle.com
 */
export class Clock {
  mcounter = 0.0; ///< modulo counter [0.0, +1.0], this is the value you use
  phaseInc = 0.0; ///< phase inc = fo/fs
  phaseOffset = 0.0; ///< PM
  freqOffset = 0.0; ///< FM
  freqHz = 0.0; ///< clock frequency

  constructor(public readonly sampleRate: number) {
    this.mcounter = 0.0;
    this.phaseOffset = 0.0;
    this.freqOffset = 0.0;
  }

  setFrequency(frequencyHz: number) {
    this.freqHz = frequencyHz;
    this.phaseInc = this.freqHz / this.sampleRate;
  }

  addPhaseOffset(phaseOffset: number, wrap: boolean) {
    this.phaseOffset = phaseOffset;
    if (this.phaseInc > 0) this.mcounter += phaseOffset;
    else this.mcounter -= phaseOffset;

    if (wrap) this.wrapClock();
  }

  removePhaseOffset() {
    if (this.phaseInc > 0) this.mcounter += -this.phaseOffset;
    else this.mcounter -= -this.phaseOffset;
  }

  advanceClock(interval: number) {
    this.mcounter += interval * this.phaseInc;
  }

  wrapClock() {
    if (this.mcounter >= 0 && this.mcounter <= 1.0) return false;

    let neg: boolean = this.mcounter < 0;
    if (!neg && this.mcounter < 2.0) {
      this.mcounter -= 1.0;
    } else if (neg && this.mcounter > -1.0) {
      this.mcounter += 1.0;
    } else {
      // wrap as many times as needed; this method is slower but takes
      // the same amount of time no matter how far outside the range the number is
      this.mcounter = wrapMinMax(this.mcounter, 0.0, 1.0);
    }

    return true;
  }
}
