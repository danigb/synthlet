import { TWO_PI } from "../shared/math";

/**
 * Virtual Analog first order filter
 *
 * Outputs low pass, high pass, all pass and low pass with analog FNG
 */
export class VA1Filter {
  private halfSamplePeriod: number;
  private cutoffFrequency: number;
  private state: number;
  output: { LPF1: number; HPF1: number; APF1: number; ANM_LPF1: number };
  private coeff: number;

  constructor(public readonly sampleRate: number) {
    this.halfSamplePeriod = 1.0 / (2.0 * sampleRate);
    this.cutoffFrequency = 0.0;
    this.state = 0.0;
    this.coeff = 0.0;
    this.output = {
      LPF1: 0.0,
      HPF1: 0.0,
      APF1: 0.0,
      ANM_LPF1: 0.0,
    };
    this.update(1000);
  }

  update(cutoff: number) {
    if (cutoff === this.cutoffFrequency) return;
    this.cutoffFrequency = cutoff;
    const g = Math.tan(TWO_PI * this.cutoffFrequency * this.halfSamplePeriod);
    this.coeff = g / (1.0 + g);
  }

  process(xn: number) {
    const vn = (xn - this.state) * this.coeff;

    this.output.LPF1 = (xn - this.state) * this.coeff + this.state;
    this.output.HPF1 = xn - this.output.LPF1;
    this.output.APF1 = this.output.LPF1 - this.output.HPF1;
    this.output.ANM_LPF1 = this.output.LPF1 + this.coeff * this.output.HPF1;
    this.state = vn + this.output.LPF1;
    return this.output;
  }
}
