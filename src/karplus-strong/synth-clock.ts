function inRange(low: number, high: number, x: number): boolean {
  return (x - high) * (x - low) <= 0.0;
}
function wrapMax(x: number, max: number): number {
  /* integer math: `(max + x % max) % max` */
  return (((max + (x % max)) % max) + max) % max;
}
function wrapMinMax(x: number, min: number, max: number) {
  return min + wrapMax(x - min, max - min);
}

class SynthClock {
  mcounter = 0.0; // modulo counter [0.0, +1.0], this is the value you use
  phaseInc = 0.0; // phase inc = fo/fs
  phaseOffset = 0.0; // PM
  freqOffset = 0.0; // FM
  frequencyHz = 0.0; // clock frequency
  sampleRate = 0.0;
  state = [0.0, 0.0, 0.0, 0.0]; // for state save

  MOD_COUNTER = 0; // for state save
  PHASE_INC = 1;
  PHASE_OFFSET = 2;
  FREQUENCY_HZ = 3;
  NUM_VARS = 4;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  /** Initialization and reset */
  reset(startValue: number = 0.0) {
    this.mcounter = startValue;
    this.phaseOffset = 0.0;
    this.freqOffset = 0.0;
  }

  initWithClock(clock: SynthClock) {
    this.mcounter = clock.mcounter;
    this.phaseInc = clock.phaseInc;
    this.phaseOffset = clock.phaseOffset;
    this.frequencyHz = clock.frequencyHz;
  }

  copyFromClock(params: SynthClock) {
    if (this === params) {
      return this;
    }

    this.mcounter = params.mcounter;
    this.phaseInc = params.phaseInc;
    this.phaseOffset = params.phaseOffset;
    this.frequencyHz = params.frequencyHz;

    for (let i = 0; i < this.state.length; i++) {
      this.state[i] = params.state[i];
    }

    return this;
  }

  /** advancing and wrapping the clock mcounter */
  advanceClock(renderInterval: number = 1) {
    this.mcounter += renderInterval * this.phaseInc;
  }

  advanceWrapClock(renderInterval: number = 1) {
    this.mcounter += renderInterval * this.phaseInc;
    return this.wrapClock(); // no wrap
  }

  /** Wrap the modulo counter */
  wrapClock() {
    if (inRange(0.0, 1.0, this.mcounter)) return false;

    let neg = this.mcounter < 0.0;
    if (!neg && this.mcounter < 2.0) this.mcounter -= 1.0;
    else if (neg && this.mcounter > -1.0) this.mcounter += 1.0;
    else this.mcounter = wrapMinMax(this.mcounter, 0.0, 1.0);

    return true;
  }

  /**
   * Set the clock frequency, which calculates the current phase increment value
   */
  setFrequency(frequencyHz: number, sampleRate: number) {
    this.frequencyHz = frequencyHz;
    this.sampleRate = sampleRate;
    this.phaseInc = this.frequencyHz / this.sampleRate;
  }

  /**
   * Phase Modulation support
   * For phase modulation, this adds a phase offset and then optionally checks/wraps the counter as needed
   */
  addPhaseOffset(phaseOffset: number, wrap: boolean): void {
    this.phaseOffset = phaseOffset;
    if (this.phaseInc > 0) {
      this.mcounter += phaseOffset;
    } else {
      this.mcounter -= phaseOffset;
    }

    if (wrap) {
      this.wrapClock();
    }
  }

  /**
   * For phase modulation, this removes a phase offset, notice that the function does not attempt to wrap the counter.
   * many algorithms require checking/wrapping the counter after removal of the phase offset so you must
   * add a call to wrapClock(); after calling this method
   */
  removePhaseOffset() {
    if (this.phaseInc > 0) {
      this.mcounter += -this.phaseOffset;
    } else {
      this.mcounter -= -this.phaseOffset;
    }
  }

  /** Frequency Modulation support */
  addFrequencyOffset(freqOffset: number) {
    this.freqOffset = freqOffset;
    this.setFrequency(this.frequencyHz + freqOffset, this.sampleRate);
  }

  removeFrequencyOffset() {
    this.setFrequency(this.frequencyHz - this.freqOffset, sampleRate);
  }

  /** For both PM and FM support */
  saveState() {
    this.state = [
      this.mcounter,
      this.phaseInc,
      this.phaseOffset,
      this.frequencyHz,
    ];
  }
}
