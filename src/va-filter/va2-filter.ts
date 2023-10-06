import { TWO_PI } from "../shared/math";

/**
 * Second order state variable filter
 *
 * @author Will Pirkle http://www.willpirkle.com
 * @see https://github.com/willpirkleaudio/SynthLab/blob/main/source/vafilters.h
 * Adapted to TypeScript by danigb
 */
export function Va2Filter(sampleRate: number) {
  let fc = 0;
  let q = 0;
  const halfSamplePeriod = 1.0 / (2.0 * sampleRate);

  const coeff = {
    a: 0.0, // alpha
    b: 1.0, // beta
    s: 1.0, // sigma
    r: 1.0, // rho
  };

  const output = {
    LP: 0.0, // low pass
    HP: 0.0, // high pass
    BP: 0.0, // band pass
    BS: 0.0, // band shelf
    ALP: 0.0, // "analog" low pass
  };
  let integrator_z0 = 0.0;
  let integrator_z1 = 0.0;

  function update(cutoffFrequency: number, resonance: number) {
    if (cutoffFrequency === fc && resonance === q) return;

    fc = cutoffFrequency;
    q = resonance;

    // warp cutoff frequency
    coeff.a = Math.tan(TWO_PI * fc * halfSamplePeriod);
    // R is the traditional analog damping factor zeta
    const R = 1.0 / (2.0 * q);
    coeff.b = 1.0 / (1.0 + 2.0 * R * coeff.a + coeff.a * coeff.a);
    if (q > 24.9) coeff.r = coeff.a;
    else coeff.r = 2.0 * R + coeff.a;

    // sigma for "analog matching" version
    const theta_c = sampleRate / 2.0 / fc;
    coeff.s = 1.0 / (coeff.a * theta_c * theta_c);
  }

  function process(xn: number) {
    output.HP = coeff.b * (xn - coeff.r * integrator_z0 - integrator_z1);
    output.BP = coeff.a * output.HP + integrator_z0;
    output.LP = coeff.a * output.BP + integrator_z1;
    output.BS = output.HP + output.LP;
    output.ALP = output.LP + coeff.s * integrator_z0;

    integrator_z0 = coeff.a * output.HP + output.BP;
    integrator_z1 = coeff.a * output.BP + output.LP;
    return output;
  }

  return { update, process, coeff };
}
