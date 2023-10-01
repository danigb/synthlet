export class FadeInModulator {
  active: boolean = false;
  value: number = 0.0;

  constructor(public readonly sampleRate: number) {}

  tick() {}
}
