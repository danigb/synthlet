/**
 * A digital version of a Schmitt trigger. A Scmitt trigger is a comparator circuit with hysteresis.
 * It detects whether the input is above or below a certain threshold
 */
export class Trigger {
  hi: boolean = false;

  process(x: number, min = 0, max = 1) {
    this.hi = x >= 1 && !this.hi ? true : false;
    return this.hi;
  }
}
