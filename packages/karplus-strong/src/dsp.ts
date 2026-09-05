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
  // Guards at both ends: the slots past the end mirror the first few, the
  // slots before the start mirror the last few, so a read straddling the wrap
  // point still reads contiguous memory and the hot loop needs no per-tap
  // wrapping. The five-tap read below is centred, so it reaches two samples
  // either side of its nominal position and runs off *both* ends - which is
  // why the tail ticket 03 sized for it now has a head to match. Logical slot
  // `s` lives at physical `s + HEAD`.
  const HEAD = 2;
  const TAIL = 4;
  const line = new Float32Array(HEAD + capacity + TAIL);

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

  // Fourth-order Lagrange interpolation for the fractional part of the delay,
  // which is what the fractional delay filter `Hfd` is in this loop. The
  // two-point linear read it replaces is a lowpass whose loss at Nyquist is
  // `|1 - 2*frac|`, applied once per trip round the loop - so the timbre used
  // to be a near-arbitrary function of `frac(sampleRate/frequency)`: at 441 Hz
  // nothing above 5 kHz decayed at all, and one semitone away it was gone in
  // 250 ms.
  //
  // Lagrange rather than allpass because a glide is a rapidly-varying delay
  // and Smith 3.6.2 names allpass as the interpolator that "can exhibit
  // artifacts when the delay changes too rapidly"; fourth order because
  // Laurson et al. 2001 call third "the minimum required for high-quality
  // synthesis at the sampling rate of 44.1 kHz" and Smith's own listing writes
  // `fdelay4`.
  //
  // The kernel is exact for a delay in [1.5, 2.5] samples measured from its
  // newest tap, so the integer split rounds rather than floors and the read
  // reaches 2.5 samples *newer* than its nominal position in the worst case.
  // That reach costs no phase delay - the five taps implement a delay of
  // exactly `readDistance` - but it does set the shortest loop the string can
  // hold, and so the highest note it can play.
  const INTERPOLATOR_REACH = 2.5;
  let c0 = 0;
  let c1 = 0;
  let c2 = 1;
  let c3 = 0;
  let c4 = 0;
  // The coefficients depend only on the fractional part, and `readIndex`
  // advances by exactly one sample per sample, so they are recomputed only
  // when the delay actually moves. Today it never moves inside a note.
  let coefficientFraction = NaN;

  // The shortest loop the string can hold, and so the highest note it can
  // play: the read's newest tap has to be a sample that has already been
  // written, and the damping filter's sample comes out of the same budget.
  // `params.ts` declares a `frequency.maxValue` this clamp can honour.
  const MIN_LOOP_LENGTH = INTERPOLATOR_REACH + 1 + phaseDelayCompensation;

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
      delayTarget = Math.min(Math.max(samples, MIN_LOOP_LENGTH), maxDelay);
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
     * `P` is `floor(read distance - the interpolator's reach)`: the read's
     * newest tap sits up to 2.5 samples ahead of its nominal position and the
     * damping filter reads `x[n]` directly, so that is where the shortest path
     * round the loop closes - and past that point a summed burst sample would
     * push the output beyond full scale.
     */
    pluck() {
      line.fill(0);
      x1 = 0;
      x2 = 0;
      delay = delayTarget; // a new note starts in tune, it does not glide into it
      burst = Math.floor(delay - phaseDelayCompensation - INTERPOLATOR_REACH);
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
        // Round, not floor: the kernel is accurate for a delay within half a
        // sample of the centre of its five taps.
        const index = Math.round(readIndex);
        const fraction = readIndex - index;

        if (fraction !== coefficientFraction) {
          coefficientFraction = fraction;
          // Delay from the newest tap, in [1.5, 2.5].
          const d = 2 - fraction;
          const d1 = d - 1;
          const d2 = d - 2;
          const d3 = d - 3;
          const d4 = d - 4;
          c0 = (d1 * d2 * d3 * d4) / 24;
          c1 = (d * d2 * d3 * d4) / -6;
          c2 = (d * d1 * d3 * d4) / 4;
          c3 = (d * d1 * d2 * d4) / -6;
          c4 = (d * d1 * d2 * d3) / 24;
        }

        // Five taps, newest first, straight through both guards.
        const tap = index + HEAD + 2;
        let sample =
          c0 * line[tap] +
          c1 * line[tap - 1] +
          c2 * line[tap - 2] +
          c3 * line[tap - 3] +
          c4 * line[tap - 4];

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
        const write = writeIndex + HEAD;
        line[write] = feedback;
        if (writeIndex < TAIL) line[write + capacity] = feedback;
        if (writeIndex >= capacity - HEAD) line[write - capacity] = feedback;
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
