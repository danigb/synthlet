import { blep, pulse, TWO_PI } from "./math";

export enum Waveforms {
  Sine = 0,
  Triangle = 1,
  Saw = 2,
  Square = 3,
  Pulse = 4,
  Noise = 5,
}

interface SmoothSwitch {
  switching: boolean;
  mix: number;
  previous: number;
  current: number;
}

export class Oscillator2 {
  private phase = 0.0;
  private phaseIncrement = 0.0;
  private triCurrent = 0.0;
  private triLast = 0.0;
  private noiseValue = 19.1919191919191919191919191919191919191919;

  waveform: Waveforms;

  constructor(waveform: Waveforms) {
    this.waveform = waveform;
  }

  public process(dt: number, frequency: number): number {
    this.phaseIncrement = frequency * dt;
    this.phase += this.phaseIncrement;
    while (this.phase > 1.0) this.phase -= 1.0;
    return this.calc(this.waveform);
  }

  private calc(waveform: Waveforms): number {
    switch (waveform) {
      case Waveforms.Sine:
        return Math.sin(this.phase * TWO_PI);
      case Waveforms.Triangle:
        this.triLast = this.triCurrent;
        this.triCurrent =
          this.phaseIncrement * pulse(this.phase, this.phaseIncrement, 0.5) +
          (1.0 - this.phaseIncrement) * this.triLast;
        return this.triCurrent * 5.0;
      case Waveforms.Saw:
        return 1.0 - 2.0 * this.phase + blep(this.phase, this.phaseIncrement);
      case Waveforms.Square:
        return pulse(this.phase, this.phaseIncrement, 0.5);
      case Waveforms.Pulse:
        return pulse(this.phase, this.phaseIncrement, 0.75);
      case Waveforms.Noise:
        // Ove Karlsen's noise algorithm
        // http://musicdsp.org/showArchiveComment.php?ArchiveID=217
        this.noiseValue += 19.0;
        this.noiseValue *= this.noiseValue;
        this.noiseValue -= Math.floor(this.noiseValue);
        return this.noiseValue - 0.5;
      default:
        return 0.0;
    }
  }

  getFromWaveform(
    dt: number,
    waveform: SmoothSwitch,
    frequency: number
  ): number {
    this.phaseIncrement = frequency * dt;
    this.phase += this.phaseIncrement;
    while (this.phase > 1.0) {
      this.phase -= 1.0;
    }

    if (waveform.switching) {
      let out = 0.0;
      out += (1.0 - waveform.mix) * this.calc(waveform.previous as Waveforms);
      out += waveform.mix * this.calc(waveform.current as Waveforms);
      return out;
    } else {
      return this.calc(waveform.current as Waveforms);
    }
  }
}
