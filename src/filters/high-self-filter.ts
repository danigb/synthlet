/**
 * Implementation of a high shelving filter
 * - taken from the AudioFilter object in the FX book below
 * - can set the fc and Q values
 * - uses biquad filter

 * @author Will Pirkle http://www.willpirkle.com
 * This object is included in Designing Audio Effects Plugins in C++ 2nd Ed. by Will Pirkle
 */
export class HighShelfFilter {
  private coeffs_a0: number = 0;
  private coeffs_a1: number = 0;
  private coeffs_a2: number = 0;
  private coeffs_b1: number = 0;
  private coeffs_b2: number = 0;
  private coeffs_c0: number = 0;
  private coeffs_d0: number = 0;
  private state_xz1: number = 0;
  private state_xz2: number = 0;
  private sampleRate: number = 1;

  public reset(sampleRate: number): void {
    this.sampleRate = sampleRate;
    this.state_xz1 = 0;
    this.state_xz2 = 0;
  }

  public setParameters(shelfFreq: number, boostCut_dB: number): void {
    const theta_c = (2 * Math.PI * shelfFreq) / this.sampleRate;
    const mu = Math.pow(10, boostCut_dB / 20);

    const beta = (1 + mu) / 4;
    const delta = beta * Math.tan(theta_c / 2);
    const gamma = (1 - delta) / (1 + delta);

    this.coeffs_a0 = (1 + gamma) / 2;
    this.coeffs_a1 = -this.coeffs_a0;
    this.coeffs_a2 = 0;
    this.coeffs_b1 = -gamma;
    this.coeffs_b2 = 0;

    this.coeffs_c0 = mu - 1;
    this.coeffs_d0 = 1;
  }

  public processAudioSample(xn: number): number {
    // --- transposed canonical
    const yn = this.coeffs_a0 * xn + this.state_xz1;

    // --- shuffle/update
    this.state_xz1 = this.coeffs_a1 * xn - this.coeffs_b1 * yn + this.state_xz2;
    this.state_xz2 = this.coeffs_a2 * xn - this.coeffs_b2 * yn;

    return xn * this.coeffs_d0 + yn * this.coeffs_c0;
  }
}
