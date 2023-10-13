/**
 * Count numbers at specific frequency
 *
 * @param sampleRate
 */
export class Counter {
  val: number;
  private prev: number;

  constructor(public max: number) {
    this.prev = 0;
    this.val = 0;
  }

  set(val: number) {
    this.val = val % this.max;
  }

  /**
   *
   * @param current Current phase
   * @returns
   */
  tick(current: number) {
    if (current < this.prev) {
      this.val = (this.val + 1) % this.max;
    }
    this.prev = current;
    return this.val;
  }
}
