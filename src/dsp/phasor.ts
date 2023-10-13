/**
 * A Phasor is a signal generator that produces a sawtooth wave with a range of -1 to 1 in a specified frequency.
 *
 *
 * From Paul Batchelor:
 *
 * The term "phasor" comes from the engineering and physics world, used to describe the complex value of a sinusoid (phase, and amplitude).
 * While not a complex value, the phasor in this computer music context could be the phase component of the phasor.
 *
 * The adoption of the phasor term in the computer music world can be traced back to one of the oldest opcodes in Csound,
 * but the author believes it may go back even further to the MUSICN family of computer music languages.
 * It is noteworthy that the word phasor is six letters, which was the character limit for opcodes in both
 * MUSICN languages and the older versions of Csound. In this context, it is a really nice name to describe this.
 *
 * @param sampleRate
 */
export class Phasor {
  phase: number;
  inc: number;

  constructor(public readonly sampleRate: number, freq: number = 440) {
    this.inc = freq / this.sampleRate;
    this.phase = 0;
  }

  /**
   * Set the frequency of the phasor
   * @param freq
   */
  freq(freq: number) {
    this.inc = freq / this.sampleRate;
  }

  tick() {
    const prev = this.phase;
    this.phase += this.inc;
    if (this.phase >= 1.0) {
      this.phase -= 1.0;
    } else if (this.phase <= -1.0) {
      this.phase += 1.0;
    }
    return prev;
  }
}
