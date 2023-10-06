import { TWO_PI } from "../shared/math";

/**
 * Virtual Analog first order filter
 *
 * Outputs low pass, high pass, all pass and modified low pass to better match analog behavior near Nyquist
 *
 * @author Will Pirkle http://www.willpirkle.com
 * @see https://github.com/willpirkleaudio/SynthLab/blob/main/source/vafilters.h
 * Adapted to TypeScript by danigb
 */
export function Va1Filter(sampleRate: number) {
  let halfSamplePeriod = 1.0 / (2.0 * sampleRate);

  let fc = 0.0; // cutoff frequency
  let sn = 0.0; // state

  // Coefficients
  const coeff = {
    a: 0.0, // alpha
    b: 1.0, // beta (only used in Korg35 and Moog)
  };

  // Outputs
  const out = {
    LP: 0.0, // low pass
    HP: 0.0, // high pass
    AP: 0.0, // all pass
    ALP: 0.0, // "analog" low pass (used in Korg35 and Moog)
  };

  function update(cutoffFrequency: number) {
    if (cutoffFrequency === fc) return;
    fc = cutoffFrequency;
    const g = Math.tan(TWO_PI * fc * halfSamplePeriod);
    coeff.a = g / (1.0 + g);
  }

  function process(xn: number) {
    const vn = (xn - sn) * coeff.a;

    out.LP = (xn - sn) * coeff.a + sn;
    out.HP = xn - out.LP;
    out.AP = out.LP - out.HP;
    out.ALP = out.LP + coeff.a * out.HP;
    sn = vn + out.LP;
    return out;
  }

  // Used in Korg35 and Moog
  function fb() {
    return sn * coeff.b;
  }

  return { coeff, process, update, fb };
}
