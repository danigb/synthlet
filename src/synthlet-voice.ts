import { Envelope } from "./envelope";
import { Oscillator } from "./oscillator";

const noteToFrequency = (note: number) => 440 * Math.pow(2, (note - 69) / 12);

export class SynthletVoice {
  #osc1: Oscillator;
  #note: number;
  #volEnv: Envelope;
  targetFrequency: number;

  constructor() {
    this.#osc1 = new Oscillator();
    this.#volEnv = new Envelope();
    this.note = 60;
  }

  set note(note: number) {
    this.#note = note;
    this.targetFrequency = noteToFrequency(note);
  }

  get note(): number {
    return this.#note;
  }

  start() {
    this.#volEnv.start();
  }

  release() {
    this.#volEnv.release();
  }

  process(dt: number) {
    // update envelopes
    const volEnvValue = this.#volEnv.process(dt);

    if (volEnvValue === 0) {
      return 0;
    }

    // update oscillators
    const oscOut = this.#osc1.process(dt, this.targetFrequency);

    // apply volume envelope
    return oscOut * volEnvValue;
  }
}
