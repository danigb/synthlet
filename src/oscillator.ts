export enum OscillatorType {
  SINE = 0,
}
export class Oscillator {
  #phase: number;
  #type: OscillatorType;

  constructor() {
    this.#phase = 0;
    this.#type = OscillatorType.SINE;
  }

  process(dt: number, frequency: number) {
    // update phase
    const phaseInc = frequency * dt;
    this.#phase += phaseInc;
    while (this.#phase > 1) {
      this.#phase -= 1;
    }

    switch (this.#type) {
      case OscillatorType.SINE:
        return Math.sin(this.#phase * 2 * Math.PI);
    }
  }
}
