const tau2pole = (tau: number) => Math.exp(-1.0 / (tau * 0.001 * 0.001));

enum AdsrMode {
  CLEAR = 0,
  ATTACK = 1,
  DECAY = 2,
  RELEASE = 3,
}

export const AdsrParams = {
  gate: { min: 0, max: 1, defaultValue: 0 },
  attack: { min: 0, max: 10, defaultValue: 0.1 },
  decay: { min: 0, max: 10, defaultValue: 0.1 },
  sustain: { min: 0, max: 1, defaultValue: 0.5 },
  release: { min: 0, max: 10, defaultValue: 0.3 },
};
export const ADSR_PARAMS = Object.keys(AdsrParams).map((name) => {
  const { min, max, defaultValue } = AdsrParams[name];
  return { name, min, max, defaultValue, automationRate: "k-rate" };
});

/**
 * This is a classic ADSR envelope generator.
 *
 * @see https://paulbatchelor.github.io/sndkit/adsr/
 */
export class Adsr {
  sampleRate: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  timer: number;
  a: number;
  b: number;
  y: number;
  x: number;
  prev: number;
  mode: AdsrMode;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    this.attack = AdsrParams.attack.defaultValue;
    this.decay = AdsrParams.decay.defaultValue;
    this.sustain = AdsrParams.sustain.defaultValue;
    this.release = AdsrParams.release.defaultValue;

    this.timer = 0;
    this.a = 0;
    this.b = 0;
    this.y = 0;
    this.x = 0;
    this.prev = 0;

    this.mode = AdsrMode.CLEAR;
  }

  private setCoefficients(value: number) {
    this.a = Math.exp(-1.0 / (value * this.sampleRate));
    this.b = 1 - this.a;
  }

  process(gate: number, input: Float32Array[], output: Float32Array[]) {
    if (gate !== 0 && this.mode === AdsrMode.CLEAR) {
      this.mode = AdsrMode.ATTACK;
      this.timer = 0;
      this.setCoefficients(0.6 * this.attack);
    } else if (gate === 0) {
      this.mode = AdsrMode.RELEASE;
      this.setCoefficients(this.release);
    }

    this.x = gate;
    this.prev = gate;

    const length = input[0].length;
    const channels = Math.min(input.length, output.length);
    if (!channels) return;

    if (this.mode === AdsrMode.CLEAR) {
      for (let i = 0; i < length; i++) {
        for (let j = 0; j < channels; j++) {
          output[j][i] = 0;
        }
      }
    } else {
      for (let i = 0; i < length; i++) {
        this.y = this.b * this.x + this.a * this.y;
        if (this.y > 0.99 && this.mode === AdsrMode.ATTACK) {
          this.mode = AdsrMode.DECAY;
          this.setCoefficients(this.decay);
        }
        if (this.mode === AdsrMode.RELEASE) {
          this.x = this.x * this.sustain;
        }
        for (let j = 0; j < channels; j++) {
          output[j][i] = this.y * input[j][i];
        }
      }
    }
  }
}
