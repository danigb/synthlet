import { random } from "./math";

export class DriftModulator {
  driftVelocity = 0;
  driftPhase = 0;

  process(dt: number) {
    this.driftVelocity += random() * 10000.0 * dt;
    this.driftVelocity -= this.driftVelocity * 2.0 * dt;
    this.driftPhase += this.driftVelocity * dt;
    return 0.001 * Math.sin(this.driftPhase);
  }
}
