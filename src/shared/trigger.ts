/**
 * A digital version of a Schmitt trigger. A Scmitt trigger is a comparator circuit with hysteresis.
 * It detects whether the input is above or below a certain threshold
 */
class Trigger {
  hi: boolean = false;

  process(x: number, min = 0, max = 1) {
    this.hi = x <= min ? false : x >= max ? true : this.hi;
    return this.hi;
  }
}
