import { TWO_PI } from "../shared/math";

/**
 * Second order state variable filter
 */
export class Va2Filter {
  coeff_alpha: number;
  coeff_alpha0: number;
  coeff_rho: number;
  coeff_sigma: number;
  cutoffFrequency: number;
  halfSamplePeriod: number;
  resonance: number;
  output: {
    LPF2: number;
    HPF2: number;
    BPF2: number;
    BSF2: number;
    ANM_LPF2: number;
  };
  integrator_z0 = 0.0;
  integrator_z1 = 0.0;

  constructor(public readonly sampleRate: number) {
    this.halfSamplePeriod = 1.0 / (2.0 * sampleRate);
    this.output = {
      LPF2: 0.0,
      HPF2: 0.0,
      BPF2: 0.0,
      BSF2: 0.0,
      ANM_LPF2: 0.0,
    };
    this.update(1000, 0.707);
  }

  update(frequencyCutoff: number, resonance: number) {
    if (
      frequencyCutoff === this.cutoffFrequency &&
      resonance === this.resonance
    )
      return;
    // --- prewarp the cutoff- these are bilinear-transform filters
    this.coeff_alpha = Math.tan(
      TWO_PI * this.cutoffFrequency * this.halfSamplePeriod
    );

    // --- note R is the traditional analog damping factor zeta
    const R = 1.0 / (2.0 * resonance);
    this.coeff_alpha0 =
      1.0 /
      (1.0 + 2.0 * R * this.coeff_alpha + this.coeff_alpha * this.coeff_alpha);

    // --- for max Q, go to self-oscillation (HOMEWORK!)
    if (resonance > 24.9) this.coeff_rho = this.coeff_alpha;
    else this.coeff_rho = 2.0 * R + this.coeff_alpha;

    // --- sigma for analog matching version
    const theta_c = sampleRate / 2.0 / frequencyCutoff;
    this.coeff_sigma = 1.0 / (this.coeff_alpha * theta_c * theta_c);

    return true;
  }

  process(xn: number) {
    this.output.HPF2 =
      this.coeff_alpha0 *
      (xn - this.coeff_rho * this.integrator_z0 - this.integrator_z1);
    this.output.BPF2 = this.coeff_alpha * this.output.HPF2 + this.integrator_z0;
    this.output.LPF2 = this.coeff_alpha * this.output.BPF2 + this.integrator_z1;
    this.output.BSF2 = this.output.HPF2 + this.output.LPF2;

    this.output.ANM_LPF2 =
      this.output.LPF2 + this.coeff_sigma * this.integrator_z0;

    this.integrator_z0 = this.coeff_alpha * this.output.HPF2 + this.output.BPF2;
    this.integrator_z1 = this.coeff_alpha * this.output.BPF2 + this.output.LPF2;
  }
}
