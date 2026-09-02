/**
 * An independent true-peak measurement, used only by the tests.
 *
 * A copy of the detector's own filter design would agree with it by
 * construction and prove nothing. This is a different order, a different
 * window and a different oversampling factor on purpose: 8x zero-stuffing
 * through a 128-tap Blackman-Harris windowed sinc, convolved directly rather
 * than in polyphase form, with each phase normalised to unit DC gain.
 *
 * It is not imported by `index.ts`, so `tsup` never bundles it - the precedent
 * for a non-test helper living in `src/` is `packages/synthlet/src/test-utils.ts`.
 *
 * Note that 8x oversampling is itself an approximation: near Nyquist the
 * densest reconstruction grid can still fall short of the true continuous
 * peak. It reads high relative to the shipped 4x detector, which is all the
 * ceiling test needs of it.
 */

const ORACLE_FACTOR = 8;
const ORACLE_TAPS = 128;

/** Blackman-Harris windowed sinc, split into `ORACLE_FACTOR` phases. */
const ORACLE_PHASES = (() => {
  const taps = new Float64Array(ORACLE_TAPS);
  for (let j = 0; j < ORACLE_TAPS; j++) {
    const x = (2 * Math.PI * j) / (ORACLE_TAPS - 1);
    const window =
      0.35875 -
      0.48829 * Math.cos(x) +
      0.14128 * Math.cos(2 * x) -
      0.01168 * Math.cos(3 * x);
    const m = j - (ORACLE_TAPS - 1) / 2;
    const arg = (m * Math.PI) / ORACLE_FACTOR;
    taps[j] = Math.abs(arg) > 1e-12 ? (window * Math.sin(arg)) / arg : window;
  }

  const phases: Float64Array[] = [];
  for (let p = 0; p < ORACLE_FACTOR; p++) {
    const branch: number[] = [];
    for (let j = p; j < ORACLE_TAPS; j += ORACLE_FACTOR) branch.push(taps[j]);
    const dc = branch.reduce((sum, tap) => sum + tap, 0);
    phases.push(Float64Array.from(branch, (tap) => tap / dc));
  }
  return phases;
})();

/** The true peak of one channel, as a linear magnitude. */
export function truePeak(signal: Float32Array | Float64Array): number {
  let peak = 0;
  for (let n = 0; n < signal.length; n++) {
    const sample = signal[n] < 0 ? -signal[n] : signal[n];
    if (sample > peak) peak = sample;

    for (const branch of ORACLE_PHASES) {
      let acc = 0;
      for (let k = 0; k < branch.length; k++) {
        const index = n - k;
        if (index < 0) break;
        acc += branch[k] * signal[index];
      }
      const magnitude = acc < 0 ? -acc : acc;
      if (magnitude > peak) peak = magnitude;
    }
  }
  return peak;
}

/** The true peak across every channel, in dBTP. */
export function truePeakDb(channels: (Float32Array | Float64Array)[]): number {
  let peak = 0;
  for (const channel of channels) {
    const channelPeak = truePeak(channel);
    if (channelPeak > peak) peak = channelPeak;
  }
  return 20 * Math.log10(peak);
}
