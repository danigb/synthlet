import { Envelope } from "./envelope";
import { Oscillator, Waveforms } from "./oscillator";

const noteToFrequency = (note: number) => 440 * Math.pow(2, (note - 69) / 12);

export class SynthletVoice {
  osc1: Oscillator;
  osc2: Oscillator;
  _note: number;
  volEnv: Envelope;
  targetFrequency: number;

  constructor() {
    this.osc1 = new Oscillator(Waveforms.Triangle);
    this.osc2 = new Oscillator(Waveforms.Square);
    this.volEnv = new Envelope();
    this.note = 60;
  }

  set note(note: number) {
    this._note = note;
    this.targetFrequency = noteToFrequency(note);
  }

  get note(): number {
    return this._note;
  }

  start() {
    this.volEnv.start();
  }

  release() {
    this.volEnv.release();
  }

  process(dt: number) {
    // update envelopes
    const volEnvValue = this.volEnv.process(dt);

    // if (volEnvValue === 0) {
    //   return 0;
    // }

    // update oscillators
    const osc1Out = this.osc1.process(dt, this.targetFrequency);
    const osc2Out = this.osc2.process(dt, this.targetFrequency - 10);

    const out = (osc1Out + osc2Out) * 0.6;

    // apply volume envelope
    return osc1Out * volEnvValue;
  }
}
