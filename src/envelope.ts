const STAGE_ATTACK = 0;
const STAGE_DECAY = 1;
const STAGE_RELEASE = 2;
const STAGE_FINISH = 3;

export class Envelope {
  stage: number;
  value: number;
  a: number;
  d: number;
  s: number;
  r: number;

  constructor() {
    this.value = 0;
    this.a = 0.1;
    this.d = 0.1;
    this.s = 0.5;
    this.r = 0.5;
    this.stage = STAGE_FINISH;
  }

  start() {
    this.stage = STAGE_ATTACK;
  }

  release() {
    this.stage = STAGE_RELEASE;
  }

  process(dt: number) {
    switch (this.stage) {
      case STAGE_ATTACK:
        this.value += (1.1 - this.value) * this.a * dt;
        if (this.value >= 1.0) {
          this.value = 1.0;
          this.stage = STAGE_DECAY;
        }
        break;
      case STAGE_DECAY:
        this.value += (this.s - this.value) * this.d * dt;
        break;
      case STAGE_RELEASE:
        this.value += (-0.1 - this.value) * this.r * dt;
        if (this.value <= 0.0) {
          this.value = 0.0;
          this.stage = STAGE_FINISH;
        }
        break;
    }
    return this.value;
  }
}
