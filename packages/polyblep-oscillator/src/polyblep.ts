export class PolyBlep {
  // Inverse of sample rate
  onedsr: number;

  // Phasor state (phase and increment)
  freq: number;
  phs: number;
  inc: number;

  // Leaky integrator (for saw)
  prev: number;

  // DC blocker (for saw)
  R: number;
  x: number;
  y: number;

  constructor(sampleRate: number) {
    this.onedsr = 1 / sampleRate;
    this.freq = 0.0;
    this.phs = 0.0;
    this.inc = 0.0;
    this.prev = 0.0;
    // The DC blocking coefficient R has been chosen to be close to 0.99 (a common DC blocker coefficient value) when the sampling rate is 44.1kHz.
    this.R = Math.exp(-1.0 / (0.0025 * sampleRate));
    this.x = 0;
    this.y = 0;
  }

  setFreq(frequency: number) {
    if (this.freq !== frequency) {
      this.freq = frequency;
      this.inc = frequency * this.onedsr;
    }
  }

  sine() {
    // compute sin
    const out = Math.sin(this.phs);

    // advance phasor
    this.phs += this.inc;
    if (this.phs > 1.0) this.phs -= 1.0;

    return out;
  }

  saw() {
    // compute saw
    const out = polyblepSawtooth(this.phs, this.inc);

    // advance phasor
    this.phs += this.inc;
    if (this.phs > 1.0) this.phs -= 1.0;

    return out;
  }

  square() {
    // compute square
    const out = polyblepSquare(this.phs, this.inc);

    // advance phasor
    this.phs += this.inc;
    if (this.phs > 1.0) this.phs -= 1.0;

    return out;
  }

  triangle() {
    // compute square
    let val = polyblepSquare(this.phs, this.inc);
    // scale and integrate
    val *= 4.0 / this.freq;
    val += this.prev;
    this.prev = val;
    // dc blocker
    this.y = val - this.x + this.R * this.y;
    this.x = val;
    const out = this.y * 0.8;

    // advance phasor
    this.phs += this.inc;
    if (this.phs > 1.0) this.phs -= 1.0;

    return out;
  }
}

/*
 * This algorithm centers around a tiny function called polyblep.
 * It applies two different polynomial curves if the position is at the beginning or ends of the position.
 */
function polyblep(phase: number, increment: number): number {
  if (phase < increment) {
    const p = phase / increment;
    return p + p - p * p - 1;
  } else if (phase > 1 - increment) {
    const p = (phase - 1) / increment;
    return p + p + p * p + 1;
  } else {
    return 0;
  }
}

function polyblepSquare(phase: number, increment: number): number {
  return (
    (phase < 0.5 ? -1 : 1) -
    polyblep(phase, increment) +
    polyblep((phase + 0.5) % 1, increment)
  );
}

function polyblepSawtooth(phase: number, increment: number): number {
  return phase * 2 - 1 - polyblep(phase, increment);
}
