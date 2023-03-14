/**
 * Implementation of a constant-Q parametric EQ filter
 * - taken from the AudioFilter object in the FX book below
 * - can set the fc and Q values
 * - uses biquad filter

 * @author Will Pirkle http://www.willpirkle.com
 * This object is included in Designing Audio Effects Plugins in C++ 2nd Ed. by Will Pirkle
 */

class ParametricFilter {
  private fc: number = 0.0;
  private Q: number = 0.0;
  private boostCut_dB: number = 0.0;
  private sampleRate: number = 1.0;
  private coeffs_a0: number = 0.0;
  private coeffs_a1: number = 0.0;
  private coeffs_a2: number = 0.0;
  private coeffs_b1: number = 0.0;
  private coeffs_b2: number = 0.0;
  private coeffs_c0: number = 0.0;
  private coeffs_d0: number = 0.0;
  private state_xz1: number = 0.0;
  private state_xz2: number = 0.0;

  constructor() {} // C-TOR

  public reset(sampleRate: number): void {
    this.sampleRate = sampleRate;
  }

  public setParameters(fc: number, Q: number, boostCut_dB: number): void {
    if (this.fc == fc && this.Q == Q && this.boostCut_dB == boostCut_dB) {
      return;
    }
    this.fc = fc;
    this.Q = Q;
    this.boostCut_dB = boostCut_dB;

    const kTwoPi = 2 * Math.PI;
    const kPi = Math.PI;

    // --- see book for formulae
    const theta_c = (kTwoPi * fc) / this.sampleRate;
    const mu = Math.pow(10.0, boostCut_dB / 20.0);

    // --- clamp to 0.95 pi/2 (you can experiment with this)
    let tanArg = theta_c / (2.0 * Q);
    if (tanArg >= (0.95 * kPi) / 2.0) {
      tanArg = (0.95 * kPi) / 2.0;
    }

    // --- intermediate variables (you can condense this if you wish)
    const zeta = 4.0 / (1.0 + mu);
    const betaNumerator = 1.0 - zeta * Math.tan(tanArg);
    const betaDenominator = 1.0 + zeta * Math.tan(tanArg);

    const beta = 0.5 * (betaNumerator / betaDenominator);
    const gamma = (0.5 + beta) * Math.cos(theta_c);
    const alpha = 0.5 - beta;

    // --- update coeffs
    this.coeffs_a0 = alpha;
    this.coeffs_a1 = 0.0;
    this.coeffs_a2 = -alpha;
    this.coeffs_b1 = -2.0 * gamma;
    this.coeffs_b2 = 2.0 * beta;

    this.coeffs_c0 = mu - 1.0;
    this.coeffs_d0 = 1.0;
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
