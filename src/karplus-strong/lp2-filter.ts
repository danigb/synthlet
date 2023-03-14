/**
 * Implements a simple 2nd order LPF
 * - taken from the AudioFilter object in the FX book below
 * - can set the fc and Q values
 * - uses biquad filter

 * @author Will Pirkle http://www.willpirkle.com
 * This object is included in Designing Audio Effects Plugins in C++ 2nd Ed. by Will Pirkle
 */
export class LP2Filter {
  private coeffs_a0: number = 0.0;
  private coeffs_a1: number = 0.0;
  private coeffs_a2: number = 0.0;
  private coeffs_b1: number = 0.0;
  private coeffs_b2: number = 0.0;
  private state_xz1: number = 0.0;
  private state_xz2: number = 0.0;
  private fc: number = 5.0;
  private Q: number = 0.5;
  private sampleRate: number = 1.0;

  public reset(sampleRate: number): void {
    this.sampleRate = sampleRate;
    this.clear();
  }

  public clear(): void {
    this.state_xz1 = 0.0;
    this.state_xz2 = 0.0;
  }

  public setParameters(fc: number, Q: number): void {
    if (this.fc === fc && this.Q === Q) {
      return;
    }

    this.fc = fc;
    this.Q = Q;

    const theta_c = (2.0 * Math.PI * fc) / this.sampleRate;
    const d = 1.0 / Q;
    const betaNumerator = 1.0 - (d / 2.0) * Math.sin(theta_c);
    const betaDenominator = 1.0 + (d / 2.0) * Math.sin(theta_c);

    const beta = 0.5 * (betaNumerator / betaDenominator);
    const gamma = (0.5 + beta) * Math.cos(theta_c);
    const alpha = (0.5 + beta - gamma) / 2.0;

    this.coeffs_a0 = alpha;
    this.coeffs_a1 = 2.0 * alpha;
    this.coeffs_a2 = alpha;
    this.coeffs_b1 = -2.0 * gamma;
    this.coeffs_b2 = 2.0 * beta;
  }

  public processAudioSample(xn: number): number {
    const yn = this.coeffs_a0 * xn + this.state_xz1;

    this.state_xz1 = this.coeffs_a1 * xn - this.coeffs_b1 * yn + this.state_xz2;
    this.state_xz2 = this.coeffs_a2 * xn - this.coeffs_b2 * yn;

    return yn;
  }
}
