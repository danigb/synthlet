export enum MikaEnvelopeStage {
  Idle = 0,
  Attack = 1,
  Decay = 2,
  Release = 3,
}

/**
 * A custom envelope for Mika synth.
 */
export class MikaEnvelope {
  private stage: MikaEnvelopeStage;
  private value: number;
  private params: { a: number; d: number; s: number; r: number };

  constructor() {
    this.params = { a: 0.1, d: 0.1, s: 0.1, r: 0.1 };
    this.stage = MikaEnvelopeStage.Idle;
    this.value = 0.0;
  }

  public start(): void {
    this.stage = MikaEnvelopeStage.Attack;
  }

  public release(): void {
    this.stage = MikaEnvelopeStage.Release;
  }

  public reset(): void {
    this.value = 0.0;
  }

  public getValue(): number {
    return this.value;
  }

  public withVelocity(velocitySensitivity: number, velocity: number): number {
    return this.value * (1.0 + (velocity - 1.0) * velocitySensitivity);
  }

  public isReleased(): boolean {
    return (
      this.stage == MikaEnvelopeStage.Release ||
      this.stage == MikaEnvelopeStage.Idle
    );
  }

  public update(a: number, d: number, s: number, r: number): void {
    this.params.a = a;
    this.params.d = d;
    this.params.s = s;
    this.params.r = r;
  }

  public process(dt: number): void {
    const { a, d, s, r } = this.params;
    switch (this.stage) {
      case MikaEnvelopeStage.Attack:
        this.value += (1.1 - this.value) * a * dt;
        if (this.value >= 1.0) {
          this.value = 1.0;
          this.stage = MikaEnvelopeStage.Decay;
        }
        break;
      case MikaEnvelopeStage.Decay:
        this.value += (s - this.value) * d * dt;
        break;
      case MikaEnvelopeStage.Release:
        this.value += (-0.1 - this.value) * r * dt;
        if (this.value <= 0.0) {
          this.value = 0.0;
          this.stage = MikaEnvelopeStage.Idle;
        }
        break;
    }
  }
}
