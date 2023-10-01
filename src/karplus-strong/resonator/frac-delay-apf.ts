/**
 * Implements a first order APF that is used to generate a fractional delay for the physical model of a string.
 * - you set the single coefficient alpha directly
 * - this really just runs a simple 1st order feedback/feedforward structure and does no calculation

 * @author Will Pirkle http://www.willpirkle.com
 */
export class FracDelayAPF {
  private alpha: number = 0.0; // our only coefficient
  private state_0 = 0.0; // state variable 0
  private state_1 = 0.0; // state variable 1

  public reset(): void {
    this.state_0 = 0.0;
    this.state_1 = 0.0;
  }

  public setAlpha(alpha: number): void {
    this.alpha = alpha;
  }

  /**
   * run the filter
   *
   * @param xn the input sample
   * @returns the filtered output
   */
  public processAudioSample(xn: number): number {
    const yn = xn * this.alpha + this.state_0 - this.alpha * this.state_1;
    this.state_0 = xn;
    this.state_1 = yn;
    return yn;
  }
}
