import { fastAtan } from "./math";

export class Filter {
  private band: number = 0.0;
  private low: number = 0.0;

  public isSilent(): boolean {
    return this.low === 0.0;
  }

  public process(
    dt: number,
    input: number,
    cutoff: number,
    resonance: number
  ): number {
    let f: number = 2.0 * Math.PI * cutoff * dt;
    f = f > 1 ? 1 : f < 0.01 ? 0.01 : f;

    // Resonance rolloff
    const maxResonance = 1.0 - f * f * f * f * f;
    const normalizedResonance =
      resonance > maxResonance ? maxResonance : resonance;

    const high = input - (this.low + this.band * (1 - normalizedResonance));
    this.band += f * high;
    this.low += f * this.band;
    this.low = fastAtan(this.low * 0.1) * 10.0;

    return this.low;
  }
}
