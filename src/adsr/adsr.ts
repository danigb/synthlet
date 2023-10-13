import { ParamsDef } from "../params-utils";

enum Stage {
  Idle,
  Attack,
  Decay,
  Sustain,
  Release,
}

export const PARAMS: ParamsDef = {
  gate: { min: 0, max: 1, init: 0 },
  attack: { min: 0, max: 10, init: 0.01 },
  decay: { min: 0, max: 10, init: 0.1 },
  sustain: { min: 0, max: 1, init: 0.5 },
  release: { min: 0, max: 10, init: 0.3 },
} as const;

/**
 * An ADSR envelope generator.
 *
 * This is a port of Nigel Redmon's ADSR code based on a one-pole filter
 *
 * @see https://www.earlevel.com/main/2013/06/01/envelope-generators/
 * @see https://github.com/willpirkleaudio/SynthLab/blob/main/source/analogegcore.h
 */
export class Adsr {
  private output: number;
  private state: number;
  private attackTime: number;
  private decayTime: number;
  private releaseTime: number;
  private attackCoef: number;
  private decayCoef: number;
  private releaseCoef: number;
  private sustainLevel: number;
  private attackBase: number;
  private decayBase: number;
  private releaseBase: number;
  private open: boolean;

  /**
   * Time Constant Offsets (TCOs)
   *
   * TCOs are values used to calculate the exponential curves.
   * An exponential envelope's behavior is modeled after an RC (resistor-capacitor)
   * circuit's charge and discharge curves. In such circuits, the time constant
   * (often represented as τ, tau) is the time required for the voltage
   * across the capacitor to reach approximately 63.2% of its final value after a change.
   */
  private attackTCO: number;
  private decayTCO: number;
  private releaseTCO: number;

  constructor(public readonly sampleRate: number) {
    this.state = Stage.Idle;
    this.open = false;
    this.output = 0.0;
    this.attackTime = 0.0;
    this.decayTime = 0.0;
    this.releaseTime = 0.0;
    this.attackCoef = 0.0;

    // Values taken from Will Pirkle's SynthLab
    this.attackTCO = Math.exp(-1.5); // fast attack
    this.decayTCO = Math.exp(-4.95);
    this.releaseTCO = this.decayTCO;

    this.setParams(
      0,
      PARAMS.attack.init,
      PARAMS.decay.init,
      PARAMS.sustain.init,
      PARAMS.release.init
    );
  }

  setGate(value: number): void {
    const open = value ? true : false;
    if (this.open === open) return;
    this.open = open;

    if (open) {
      this.state = Stage.Attack;
    } else if (this.state !== Stage.Idle) {
      this.state = Stage.Release;
    }
  }

  setParams(
    gate: number,
    attack: number,
    decay: number,
    sustain: number,
    release: number
  ): void {
    // Sustain needs to be first
    this.setGate(gate);
    this.setSustainLevel(sustain);
    this.setAttackTime(attack);
    this.setDecayTime(decay);
    this.setReleaseTime(release);
  }

  process(): number {
    switch (this.state) {
      case Stage.Idle:
        break;
      case Stage.Attack:
        this.output = this.attackBase + this.output * this.attackCoef;
        if (this.output >= 1.0 || this.attackTime <= 0) {
          this.output = 1.0;
          this.state = Stage.Decay;
        }
        break;
      case Stage.Decay:
        this.output = this.decayBase + this.output * this.decayCoef;
        if (this.output <= this.sustainLevel || this.decayTime <= 0) {
          this.output = this.sustainLevel;
          this.state = Stage.Sustain;
        }
        break;
      case Stage.Sustain:
        this.output = this.sustainLevel;
        break;
      case Stage.Release:
        this.output = this.releaseBase + this.output * this.releaseCoef;
        if (this.output <= 0.0 || this.releaseTime <= 0) {
          this.output = 0.0;
          this.state = Stage.Idle;
        }
    }
    return this.output;
  }

  private setSustainLevel(level: number): void {
    if (this.sustainLevel === level) return;
    this.sustainLevel = level;
    this.decayTime = -1; // force recalculation
  }

  private setAttackTime(time: number): void {
    if (this.attackTime === time) return;
    this.attackTime = time;
    const samples = this.sampleRate * time;
    const tco = this.attackTCO;
    this.attackCoef = Math.exp(-Math.log((1.0 + tco) / tco) / samples);
    this.attackBase = (1.0 + tco) * (1.0 - this.attackCoef);
  }

  private setDecayTime(time: number): void {
    if (this.decayTime === time) return;
    this.decayTime = time;
    const samples = this.sampleRate * time;
    const tco = this.decayTCO;
    this.decayCoef = Math.exp(-Math.log((1.0 + tco) / tco) / samples);
    this.decayBase = (this.sustainLevel - tco) * (1.0 - this.decayCoef);
  }

  private setReleaseTime(time: number): void {
    if (this.releaseTime === time) return;
    this.releaseTime = time;
    const samples = this.sampleRate * time;
    const tco = this.releaseTCO;
    this.releaseCoef = Math.exp(-Math.log((1.0 + tco) / tco) / samples);
    this.releaseBase = -tco * (1.0 - this.releaseCoef);
  }
}
