/**
 * Implements a first order HPF with fc = 2.0Hz
 * - taken from the AudioFilter object in the FX book below
 * - generates HPF with zero at 0.0Hz
 * - can not change fc after construction
 *
 * @author Will Pirkle http://www.willpirkle.com
 */
export class DCRemovalFilter {
  coeffs_a0: number = 0.0;
  coeffs_a1: number = 0.0;
  coeffs_a2: number = 0.0;
  coeffs_b1: number = 0.0;
  coeffs_b2: number = 0.0;
  state_xz1: number = 0.0;
  state_xz2: number = 0.0;
  private fc: number = 1.0; // hardcoded fc value
  private sampleRate: number = 1.0;

  /**
   * Flush state variables and set the fc value, that is usually just hardcoded
   * @param sampleRate sample rate value
   */
  public reset(sampleRate: number): void {
    this.sampleRate = sampleRate;

    // see book for formulae
    const theta_c = (2 * Math.PI * this.fc) / this.sampleRate;
    const gamma = Math.cos(theta_c) / (1.0 + Math.sin(theta_c));

    // update coeffs
    this.coeffs_a0 = (1.0 + gamma) / 2.0;
    this.coeffs_a1 = -(1.0 + gamma) / 2.0;
    this.coeffs_a2 = 0.0;
    this.coeffs_b1 = -gamma;
    this.coeffs_b2 = 0.0;
  }

  /**
   * Run the filter
   * @param xn the input sample
   * @returns the filtered output
   */
  public processAudioSample(xn: number): number {
    // transposed canonical
    let yn = this.coeffs_a0 * xn + this.state_xz1;

    // shuffle/update
    this.state_xz1 = this.coeffs_a1 * xn - this.coeffs_b1 * yn + this.state_xz2;
    this.state_xz2 = this.coeffs_a2 * xn - this.coeffs_b2 * yn;

    return yn;
  }
}
