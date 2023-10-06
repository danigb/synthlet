import { TWO_PI } from "../shared/math";
import { Va1Filter } from "./va1-filter";

/**
 * Emulation of a Korg35 second order resonant filter (used in the Korg MS-10 and MS-20 synthesizers)
 *
 * Outputs low pass, high pass, all pass and "analog" low pass
 *
 * @author Will Pirkle http://www.willpirkle.com
 * @see https://github.com/willpirkleaudio/SynthLab/blob/main/source/vafilters.h
 * Adapted to TypeScript by danigb
 */
export function Korg35Filter(sampleRate: number) {
  const halfSamplePeriod = 1.0 / (2.0 * sampleRate);
  let fc = 0.0;
  let q = 0.0;

  const coeff = {
    K: 1.0,
    a: 0.0,
    b: 0.0,
    g: 0.0,
  };

  // Each Korg35 filter type uses 3 1-pole sub-filters
  // See Designing Audio Effects Plugins in C++ 2nd Ed. by Will Pirkle
  const lpf1 = Va1Filter(sampleRate);
  const lpf2 = Va1Filter(sampleRate);
  const lpf3 = Va1Filter(sampleRate);
  const hpf1 = Va1Filter(sampleRate);
  const hpf2 = Va1Filter(sampleRate);
  const hpf3 = Va1Filter(sampleRate);

  const out = {
    LP: 0.0,
    HP: 0.0,
    ALP: 0.0,
  };

  function update(cutoffFrequency: number, resonance: number) {
    if (cutoffFrequency == fc && resonance == q) return;

    fc = cutoffFrequency;
    q = resonance;
    coeff.g = Math.tan(TWO_PI * fc * halfSamplePeriod);
    coeff.a = coeff.g / (1.0 + coeff.g);
    coeff.b = 1.0 / (1.0 - coeff.K * coeff.a + coeff.K * coeff.a * coeff.a);

    // Alpha is the same for all sub-filters
    lpf1.coeff.a = lpf2.coeff.a = lpf3.coeff.a = coeff.a;
    hpf1.coeff.a = hpf2.coeff.a = hpf3.coeff.a = coeff.a;
    // Low pass beta
    lpf2.coeff.b = (coeff.K * (1.0 - coeff.a)) / (1.0 + coeff.g);
    lpf3.coeff.b = -1.0 / (1.0 + coeff.g);
    // High pass beta
    hpf2.coeff.b = -coeff.a / (1.0 + coeff.g);
    hpf3.coeff.b = 1.0 / (1.0 + coeff.g);
  }

  function process(xs: number) {
    // LOW PASS (sub-filters: low pass, low pass, high pass)

    // Feed input to lpf1 (low pass) and get output
    let tmp = lpf1.process(xs);
    // Get fb from lpf2 (low pass) and lpf3 (high pass)
    let s35 = lpf2.fb() + lpf3.fb();
    // Calculate u from low pass filter
    let u = coeff.a * (tmp.ALP + s35);
    // Feed u into lpf2 (low pass) and get output
    tmp = lpf2.process(u);
    // Write LP output
    out.LP = tmp.LP * coeff.K;
    out.ALP = tmp.ALP * coeff.K;
    // Feedback into lpf3
    lpf3.process(out.LP);

    // HIGH PASS (sub-filters: high pass, high pass, low pass)

    // Feed input into hpf1
    tmp = hpf1.process(xs);
    // Get feedback from hpf2 and hpf3
    s35 = hpf2.fb() + hpf3.fb();
    // Calculate u from high pass filter
    u = coeff.a * (tmp.HP + s35);
    // write high pass output
    out.HP = u * coeff.K;
    // feedback into hpf2 and hpf3
    tmp = hpf2.process(out.HP);
    hpf3.process(tmp.HP);

    // auto-normalize
    if (coeff.K > 0) {
      const invK = 1.0 / coeff.K;
      out.LP *= invK;
      out.HP *= invK;
      out.ALP *= invK;
    }
    return out;
  }

  return { update, process };
}
