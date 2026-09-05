import { createGateDetector } from "./_gate";

// The string, as the literature draws it: Bank and Valimaki factor the loop
// into `Hl(z) = Hloss(z)*Hdisp(z)*Hfd(z)` and Smith's EKS listing puts the
// excitation chain *outside* it -
//
//   stringloop = (+ : fdelay4(Pmax, P-2)) ~ (loopfilter);
//   process = filtered_excitation : stringloop : ...
//
// - and this file is that shape. `Hloss` is Smith's EKS two-zero damping
// filter; `Hdisp` is not written yet and `Hfd` is still the two-point linear
// read the fractional delay started as. The excitation is an unshaped
// full-scale burst. Every later ticket fills in one block and carries one
// measurement.
//
// Deliberately not built on `scripts/_delay.ts`, synthlet's shared circular
// buffer: its fractional reads are linear and Hermite, and the read this
// package needs next is fourth-order Lagrange (Hermite is not in the paper
// corpus this package is implemented from). Consolidating the two is a
// repo-wide decision; this is written as if it were going to move.

/**
 * One string: a delay line, a loop, and an excitation summed into the loop's
 * input. It holds no module-level state, so it can be instantiated as many
 * times as a voice needs - two of them is what a pair of polarizations is.
 */
export function createString(sampleRate: number, minFrequency: number) {
  // The line has to hold the longest period the declared range asks for, so
  // its size comes from `params.ts`'s `frequency.minValue` rather than a
  // literal: the buffer and the declared range cannot drift apart again.
  const maxDelay = Math.ceil(sampleRate / minFrequency); // 2205 at 20 Hz
  const capacity = maxDelay + 1;
  // The guard tail: the last GUARD slots mirror the first GUARD, so a read
  // straddling the wrap point still reads contiguous memory and the hot loop
  // needs no per-tap wrapping. Linear interpolation needs one; a fourth-order
  // Lagrange read needs three past the integer tap, so the tail is sized for
  // that now and the ticket that swaps the interpolator changes only the read.
  const GUARD = 4;
  const line = new Float32Array(capacity + GUARD);

  // The note ends on an envelope of |y|, not on an instantaneous sample: the
  // signal is noise-derived, so a bare threshold on one sample is satisfied by
  // a zero crossing at any amplitude. -100 dBFS is inaudible under any gain.
  const stopThreshold = 1e-5; // -100 dBFS
  // One-pole follower, 5 ms. It settles (5 tau, 1103 samples) inside half a
  // period at 20 Hz - the lowest pitch params.ts declares, 2205 samples - so
  // it never mistakes a trough for silence at any supported pitch.
  const envelopeCoefficient = 1 - Math.exp(-1 / (0.005 * sampleRate));

  let writeIndex = 0;
  let delay = maxDelay; // read distance in samples, this sample
  let delayTarget = maxDelay; // where it is heading, reached over a block
  // Every filter in the loop is paid for out of the loop length or the string
  // detunes - Smith's `P - 2` is one sample for the damping FIR and one for
  // the interpolator. The damping filter below is the first half of that; the
  // interpolator's share is still unaccounted for, which is the defect ticket
  // 05 measures. The bookkeeping is written here once, not re-derived by each
  // ticket that adds a filter.
  const DAMPING_PHASE_DELAY = 1;
  const phaseDelayCompensation = DAMPING_PHASE_DELAY;

  // Smith's EKS two-zero damping filter, `rho * (h0*x' + h1*(x + x''))`, and
  // the one thing that makes this Karplus-Strong rather than a leaky comb: it
  // is what makes high partials die before low ones. Its impulse response is
  // symmetric about n = 1, so its phase delay is exactly one sample at every
  // frequency - which is why `brightness` can change the tone without
  // detuning the string, and why the sample it costs can be subtracted from
  // the loop length once rather than tracked per pitch.
  let rho = 0;
  let h0 = 1;
  let h1 = 0;
  let x1 = 0; // x[n-1]
  let x2 = 0; // x[n-2]

  let burst = 0; // excitation samples still to be summed in
  let envelope = 0;
  let ringing = false;

  return {
    /**
     * The loop's target length in samples; reached over the block, snapped by
     * a pluck. The floor is what the filter chain costs plus one, because the
     * read distance is the length *minus* that and a distance below 1 reads
     * the slot about to be written.
     */
    setDelay(samples: number) {
      delayTarget = Math.min(
        Math.max(samples, 1 + phaseDelayCompensation),
        maxDelay,
      );
    },

    /**
     * The loss chain: `gain` is the once-per-period loop gain and
     * `brightness` splits it across frequency. B = 1 gives `[0, 1, 0]`, a bare
     * one-sample delay damped only by `gain`; B = 0 gives `[1/4, 1/2, 1/4]`,
     * the raised cosine with a zero at Nyquist. DC gain is `h0 + 2*h1 = 1` for
     * every B, so brightness moves the rolloff and never the decay time.
     */
    setDamping(gain: number, brightness: number) {
      rho = gain;
      h0 = (1 + brightness) / 2;
      h1 = (1 - brightness) / 4;
    },

    /**
     * Excites the string: `P` full-scale samples summed into the loop input,
     * where the old code filled the whole delay line. Only the `P` samples the
     * read pointer had not yet reached were ever heard, so it is the same
     * excitation - as a signal, which is what lets a later ticket filter,
     * position and level it.
     *
     * `P` is `floor(read distance)`: the interpolator's second tap sits one
     * sample *newer* than its first and the damping filter reads `x[n]`
     * directly, so the shortest path round the loop closes there - and past
     * that point a summed burst sample would push the output beyond full
     * scale.
     */
    pluck() {
      line.fill(0);
      x1 = 0;
      x2 = 0;
      delay = delayTarget; // a new note starts in tune, it does not glide into it
      burst = Math.floor(delay - phaseDelayCompensation);
      // The burst is full scale, so the follower starts there rather than at
      // zero - a zeroed envelope is below the threshold and would stop the
      // note on its first sample.
      envelope = 1;
      ringing = true;
    },

    /** Renders `[from, to)` of one block. */
    process(output: Float32Array, from: number, to: number) {
      if (!ringing) {
        output.fill(0, from, to);
        return;
      }
      // Per-block parameter interpolation, (target - current)/blockSize.
      // Nothing moves the target mid-note yet, so this is exactly 0 and the
      // delay is bit-for-bit constant while the string rings.
      const increment = to > from ? (delayTarget - delay) / (to - from) : 0;

      for (let i = from; i < to; i++) {
        delay += increment;
        let readIndex = writeIndex - (delay - phaseDelayCompensation);
        if (readIndex < 0) readIndex += capacity;
        const index = Math.floor(readIndex);
        const frac = readIndex - index;
        // The guard tail is what makes the second tap unconditional: at the
        // end of the line it reads the mirror of slot 0.
        const a = line[index];
        let sample = a + frac * (line[index + 1] - a);

        if (burst > 0) {
          sample += Math.random() * 2 - 1;
          burst--;
        }
        output[i] = sample;

        // The loop filter. `h0 + 2*h1` is 1 for every brightness, so this is a
        // contraction whenever `rho < 1` and the loop cannot grow.
        const feedback = rho * (h0 * x1 + h1 * (sample + x2));
        x2 = x1;
        x1 = sample;
        line[writeIndex] = feedback;
        if (writeIndex < GUARD) line[writeIndex + capacity] = feedback;
        writeIndex = writeIndex + 1 === capacity ? 0 : writeIndex + 1;

        // Stop playing once the envelope - not one sample - is inaudible
        envelope += envelopeCoefficient * (Math.abs(sample) - envelope);
        if (envelope < stopThreshold) {
          ringing = false;
          output.fill(0, i + 1, to);
          return;
        }
      }
    },
  };
}

/** One voice: a string, the gate contract, and the parameter mapping. */
export function createKS(sampleRate: number, minFrequency: number) {
  const targetAmplitude = 0.001; // Amplitude decays to 0.1% of initial value
  // A ceiling on the loop gain, so that no parameter combination can hold the
  // loop at unity. Its knee is 690775 periods; the declared ranges reach
  // 20 kHz x 5 s = 100000, so it never binds on a real setting.
  const maxLoopGain = 0.99999;
  const string = createString(sampleRate, minFrequency);
  const detectGate = createGateDetector();

  return (
    output: Float32Array,
    trigger: number | ArrayLike<number>,
    frequency: number,
    decay: number,
    // `params.ts` declares the same default; a four-argument call is the
    // shipped sound rather than an arbitrary one.
    brightness = 0.5,
  ) => {
    // Smith 3.3: the loop filter is applied once per period, so -60 dB in
    // `decay` seconds needs `rho^(f0*decay) = 0.001`. Pitch-independent by
    // construction - which is the whole fix for a knob that used to be a count
    // of periods and so rang 15x longer at 110 Hz than at 1760 Hz.
    const periods = frequency * decay;
    string.setDamping(
      periods > 0
        ? Math.min(Math.pow(targetAmplitude, 1 / periods), maxLoopGain)
        : 0, // a non-positive decay would invert the exponent and grow the loop
      brightness,
    );

    const length = output.length;
    let start = 0;

    // The rising edge is the whole anti-double-trigger rule: re-plucking needs
    // the trigger to return to <= 0 first, which is a genuine retrigger.
    if (typeof trigger === "number" || trigger.length <= 1) {
      // k-rate: one value for the block, tested once - what it cost before.
      const value = typeof trigger === "number" ? trigger : trigger[0];
      if (detectGate(value) === true) {
        string.setDelay(sampleRate / frequency);
        string.pluck();
      }
    } else {
      // a-rate: the block is rendered in segments split at the rising edges,
      // so a pluck scheduled mid-block starts mid-block instead of being
      // quantised to the render quantum (2.9 ms at 44.1 kHz).
      for (let i = 0; i < length; i++) {
        if (detectGate(trigger[i]) === true) {
          if (i > start) string.process(output, start, i);
          string.setDelay(sampleRate / frequency);
          string.pluck();
          start = i;
        }
      }
    }

    string.process(output, start, length);
  };
}
