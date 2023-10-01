/**
 * Implementation of a one-pole LPF
 * - taken from the AudioFilter object in the FX book below
 * - can set the fc and Q values
 * - uses biquad filter
 *
 * @author Will Pirkle http://www.willpirkle.com
 * This object is included in Designing Audio Effects Plugins in C++ 2nd Ed. by Will Pirkle
 */
export class LP1PFilter {
  private coeffs_a0: number = 0.0;
  private coeffs_a1: number = 0.0;
  private coeffs_a2: number = 0.0;
  private coeffs_b1: number = 0.0;
  private coeffs_b2: number = 0.0;
  private state_xz1: number = 0.0;
  private state_xz2: number = 0.0;
  private fc = 5.0;
  private sampleRate = 1.0;

  /** reset to init state */
  reset(_sampleRate: number) {
    this.clear();
    this.sampleRate = _sampleRate;
  }

  /** clear state variables */
  clear() {
    this.state_xz1 = 0.0;
    this.state_xz2 = 0.0;
  }

  /** set the filter fc */
  setParameters(_fc: number) {
    if (this.fc == _fc) return;

    this.fc = _fc;

    // --- see book for formulae
    const theta_c = (2.0 * Math.PI * this.fc) / this.sampleRate;
    const gamma = 2.0 - Math.cos(theta_c);

    const filter_b1 = Math.pow(gamma * gamma - 1.0, 0.5) - gamma;
    const filter_a0 = 1.0 + filter_b1;

    // --- update coeffs
    this.coeffs_a0 = filter_a0;
    this.coeffs_a1 = 0.0;
    this.coeffs_a2 = 0.0;
    this.coeffs_b1 = filter_b1;
    this.coeffs_b2 = 0.0;
  }

  processAudioSample(xn: number) {
    // --- transposed canonical
    const yn = this.coeffs_a0 * xn + this.state_xz1;

    // --- shuffle/update
    this.state_xz1 = this.coeffs_a1 * xn - this.coeffs_b1 * yn + this.state_xz2;
    this.state_xz2 = this.coeffs_a2 * xn - this.coeffs_b2 * yn;
    return yn;
  }
}
