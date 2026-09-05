import { createGateDetector } from "./_gate";

// The string, as the literature draws it: Bank and Valimaki factor the loop
// into `Hl(z) = Hloss(z)*Hdisp(z)*Hfd(z)` and Smith's EKS listing puts the
// excitation chain *outside* it -
//
//   stringloop = (+ : fdelay4(Pmax, P-2)) ~ (loopfilter);
//   process = filtered_excitation : stringloop : ...
//
// - and this file is that shape and nothing more. There are no filters in the
// loop yet and the excitation is still an unshaped full-scale burst, so it
// sounds exactly like the 81-line comb it replaces. Every later ticket fills
// in one block and carries one measurement.
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
  // the interpolator. This loop has no filters yet, so it is 0; the
  // bookkeeping is written here once, not re-derived by each ticket that adds
  // one.
  const phaseDelayCompensation = 0;
  let loopGain = 0;
  let burst = 0; // excitation samples still to be summed in
  let envelope = 0;
  let ringing = false;

  return {
    /** The loop's target length in samples; reached over the block, snapped by a pluck. */
    setDelay(samples: number) {
      delayTarget = Math.min(Math.max(samples, 1), maxDelay);
    },

    /** The whole loss chain, for now: one scalar applied once per trip round the loop. */
    setLoopGain(gain: number) {
      loopGain = gain;
    },

    /**
     * Excites the string: `P` full-scale samples summed into the loop input,
     * where the old code filled the whole delay line. Only the `P` samples the
     * read pointer had not yet reached were ever heard, so it is the same
     * excitation - as a signal, which is what lets a later ticket filter,
     * position and level it.
     *
     * `P` is `floor(delay)`, not `ceil`: the interpolator's second tap sits
     * one sample *newer* than its first, so the loop starts feeding itself at
     * `floor(delay)` - where the old fill also stopped reading pure noise, and
     * past which a summed burst sample would push the output beyond full scale.
     */
    pluck() {
      line.fill(0);
      delay = delayTarget; // a new note starts in tune, it does not glide into it
      burst = Math.floor(delay);
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

        const feedback = loopGain * sample;
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
  const string = createString(sampleRate, minFrequency);
  const detectGate = createGateDetector();

  return (
    output: Float32Array,
    trigger: number | ArrayLike<number>,
    frequency: number,
    decay: number,
  ) => {
    // Unchanged by the rewrite, defect included: the gain is applied once per
    // trip round the loop, so `decay` is a count of periods rather than a time
    // and one knob position rings for 40 s at 110 Hz and 2 s at 1760 Hz.
    const decayTimeInSamples = 0.1 * decay * sampleRate;
    string.setLoopGain(Math.pow(targetAmplitude, 1 / decayTimeInSamples));

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
