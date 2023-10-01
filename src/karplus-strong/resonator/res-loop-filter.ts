/**
 * Implements a first order feedforward LPF with coefficients a0 = a1 = 0.5
 * - generates LPF with zero at Nyquist
 * - generates exactly 1/2 sample of delay
 * - used for tuning the resonator in a plucked string model for an exact pitch
 *
 * @author Will Pirkle http://www.willpirkle.com
 */
export class ResLoopFilter {
  private state: number[] = [0.0, 0.0]; // state variables
  private state_0 = 0.0; // state variable 0

  reset(): void {
    this.state_0 = 0.0;
  }

  /**
   * run the filter
   * @param xn the input sample
   * @return the filtered output
   */
  processAudioSample(xn: number): number {
    const yn = 0.5 * xn + 0.5 * this.state_0;
    this.state_0 = xn;
    return yn;
  }
}
