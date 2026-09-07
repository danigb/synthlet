import { createOversampler, oversamplerLatency } from "./oversample";

const SR = 48000;
const BLOCK = 128;

/** A round trip through the resampler, rendered in blocks as the worklet does. */
function roundTrip(factor: number, taps: number, signal: Float32Array) {
  const os = createOversampler(factor, taps);
  const up = new Float32Array(BLOCK * factor);
  const out = new Float32Array(signal.length);
  for (let i = 0; i < signal.length; i += BLOCK) {
    os.up(signal, i, i + BLOCK, up);
    os.down(up, i, i + BLOCK, out);
  }
  return out;
}

function sine(frequency: number, length: number) {
  const signal = new Float32Array(length);
  for (let n = 0; n < length; n++) {
    signal[n] = Math.sin((2 * Math.PI * frequency * n) / SR);
  }
  return signal;
}

/** Error energy against the input delayed by the stated latency, in dB. */
function errorDb(factor: number, taps: number, frequency: number) {
  const length = 8192;
  const input = sine(frequency, length);
  const out = roundTrip(factor, taps, input);
  const latency = oversamplerLatency(factor, taps);
  let error = 0;
  let reference = 0;
  for (let n = length / 2; n < length; n++) {
    const d = out[n] - input[n - latency];
    error += d * d;
    reference += input[n - latency] * input[n - latency];
  }
  return 10 * Math.log10(error / reference);
}

describe("the resampler", () => {
  // 2 and 8 are what `worklet.ts` ships; 4 is here because the factor was
  // chosen by measurement and the alternative has to keep working for the next
  // person who re-measures it.
  const SHIPPED = { factor: 2, taps: 8 };

  it("passes the audio band through unchanged", () => {
    // -80 dB of error energy is 0.01% - four decades under anything the
    // filter measurements resolve. The band stops at 15 kHz because the
    // transition of any finite resampler straddles Nyquist; see below.
    for (const f of [100, 1000, 5000, 10000, 15000]) {
      expect(errorDb(SHIPPED.factor, SHIPPED.taps, f)).toBeLessThan(-80);
    }
  });

  it("droops in the top octave, which is the transition band", () => {
    // Stated rather than asserted away: a linear-phase FIR cannot have a
    // vertical edge, so the region around Nyquist is neither passed nor
    // stopped. At 48 kHz that is above 15 kHz, and it is the price of the
    // resampling rather than a defect in it.
    expect(errorDb(SHIPPED.factor, SHIPPED.taps, 20000)).toBeGreaterThan(-30);
    expect(errorDb(SHIPPED.factor, SHIPPED.taps, 20000)).toBeLessThan(-10);
  });

  it("has exactly the latency it says it has", () => {
    // A symmetric FIR delays by half its length and there are two of them, so
    // the round trip is `2 * tapsPerPhase` base-rate samples whatever the
    // factor is. `worklet.ts` exports that number as `LATENCY_SAMPLES` and the
    // README states it.
    for (const factor of [2, 4]) {
      for (const taps of [4, 8]) {
        expect(oversamplerLatency(factor, taps)).toBe(2 * taps);

        // Measured, not just declared: an impulse comes back centred there.
        const length = 512;
        const impulse = new Float32Array(length);
        impulse[0] = 1;
        const out = roundTrip(factor, taps, impulse);
        let peak = 0;
        let at = 0;
        for (let n = 0; n < length; n++) {
          if (Math.abs(out[n]) > peak) {
            peak = Math.abs(out[n]);
            at = n;
          }
        }
        expect(at).toBe(oversamplerLatency(factor, taps));
      }
    }
  });

  // What the resampler is for: a tone above the base Nyquist, present in the
  // oversampled domain because the filter's nonlinearity put it there, must
  // not come back down as an alias. Fed straight into the downsampler, which
  // is where the filter's own harmonics arrive.
  const rejection = (frequency: number) => {
    const os = createOversampler(SHIPPED.factor, SHIPPED.taps);
    const length = 8192;
    const over = new Float32Array(length * SHIPPED.factor);
    const out = new Float32Array(length);
    for (let n = 0; n < over.length; n++) {
      over[n] = Math.sin((2 * Math.PI * frequency * n) / (SR * SHIPPED.factor));
    }
    for (let i = 0; i < length; i += BLOCK) {
      os.down(over.subarray(i * SHIPPED.factor), i, i + BLOCK, out);
    }
    let energy = 0;
    for (let n = length / 2; n < length; n++) energy += out[n] * out[n];
    return 10 * Math.log10(energy / (length / 2) / 0.5);
  };

  it("stops content the base rate cannot carry", () => {
    // Measured: -42 dB at 30 kHz, -76 at 36 kHz, -83 at 44 kHz. The shape is
    // the story - 24 kHz is the cutoff, and the stopband is only fully reached
    // an octave or so above it, because a 33-tap kernel has a transition band
    // and not an edge. The harmonics a saturating filter generates fall off
    // with order, so the ones landing deepest in the stopband are also the
    // quietest, which is why `aliasing.test.ts` improves by 10-33 dB rather
    // than by 80.
    expect(rejection(30000)).toBeLessThan(-38);
    expect(rejection(36000)).toBeLessThan(-70);
    expect(rejection(44000)).toBeLessThan(-70);
  });
});
