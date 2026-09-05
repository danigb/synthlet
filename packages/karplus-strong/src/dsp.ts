import { createGateDetector } from "./_gate";

// The string, as the literature draws it: Bank and Valimaki factor the loop
// into `Hl(z) = Hloss(z)*Hdisp(z)*Hfd(z)` and Smith's EKS listing puts the
// excitation chain *outside* it -
//
//   stringloop = (+ : fdelay4(Pmax, P-2)) ~ (loopfilter);
//   process = filtered_excitation : stringloop : ...
//
// - and this file is that shape. `Hloss` is Smith's EKS two-zero damping
// filter; `Hfd` is a fourth-order Lagrange read; `Hdisp` is not written yet.
// The excitation is Smith's three-filter chain, outside the loop. Every later
// ticket fills in one block and carries one measurement.
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

  // The excitation chain, and every filter in it is *outside* the loop, which
  // is the whole reason none of these four parameters can destabilise anything
  // - Smith's EKS listing:
  //
  //   filtered_excitation = excitation : smooth(pickangle)
  //       : pickposfilter : levelfilter(L,freq);
  //   process = filtered_excitation : stringloop : ...
  //
  // The burst is generated into a buffer at pluck time rather than sample by
  // sample, for two reasons: its exact mean can be removed (see `pluck`), and
  // the pick-position comb can read *it* at `e - combDelay` instead of owning a
  // second delay line. That reorders the chain to comb, pick angle, level,
  // which Smith explicitly allows: "the filters in series outside the feedback
  // loop can of course be implemented in any order".
  const noise = new Float32Array(maxDelay);
  let burstLength = 0; // noise samples in the buffer
  let excitationIndex = 0; // where the chain is in its timeline
  let excitationLength = 0; // burst + comb delay + the filters' tails
  let combDelay = 0; // floor(position * P); 0 bypasses the comb
  let pickCoefficient = 1; // 1 - p, the pick-direction one-pole
  let pickState = 0;
  let levelGain = 0; // Smith's dynamic-level lowpass, bilinear form
  let levelPole = 0;
  let levelState = 0;
  let levelDirect = 1; // L * L0(L), the panned-in dry path
  let levelMix = 0; // 1 - L, the panned-in filtered path
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
     * Excites the string: a noise burst of `P` samples, shaped by Smith's
     * three excitation filters, summed into the loop input.
     *
     * The defaults here are the *neutral* settings - no level change, no
     * dynamic filter, no comb, no pick-direction tilt - so a bare `pluck()` is
     * the unshaped burst that was here before this chain existed, sample for
     * sample. The shipped defaults live in `params.ts` and reach this through
     * `createKS`, which is where every other parameter mapping is too.
     *
     * - `level` scales the burst, before the filters. A pluck stops being a
     *   0 dBFS transient whatever the patch's gain staging.
     * - `dynamics` is Smith 3.5's dynamic-level filter: "in real strings, the
     *   spectral centroid typically rises as plucking/striking becomes more
     *   energetic". Mapped to his Nyquist-limit level `L` by `L = dynamics^(5/3)`
     *   - the exponent that puts his own default of -10 dB at the knob's
     *   midpoint, since `0.5^k = 10^(-10/20)` gives `k = 1/(2*log10(2)) =
     *   1.661`. `dynamics = 1` is `L = 1`, where "the lowpass filter is
     *   bypassed"; his -60 dB extreme is at 0.126. His note is worth keeping:
     *   "a lively clavier is obtained by tying L to gain (MIDI velocity)".
     * - `position` is Smith 3.2's pick-position comb, `1 - z^-floor(beta*P)`,
     *   beta being normalised position with 0 at the bridge. Truncated rather
     *   than interpolated, on his own authority: "pick position accuracy is
     *   normally not critical, hence the 1% slider steps and lack of
     *   delay-line interpolation in the comb filter". Lehtonen, Valimaki and
     *   Laakso 2008 give the fractional-delay form, which is for cancelling
     *   partials exactly - an analysis tool, not a timbre knob.
     * - `pickAngle` is Smith 3.1's pick-direction one-pole, `(1-p)/(1-p*z^-1)`,
     *   "a different coefficient for an up-pick than for a down-pick (such as 0
     *   and 0.9) ... resulting in different plucking stiffness". Unity DC gain,
     *   so it tilts the burst without changing its level.
     *
     * The burst is `floor(read distance - the interpolator's reach)` samples:
     * the read's newest tap sits up to 2.5 samples ahead of its nominal
     * position and the damping filter reads `x[n]` directly, so that is where
     * the shortest path round the loop closes. That bound is why the *burst*
     * cannot outlast the loop; the comb and the level filter's tail
     * deliberately do, exactly as Smith's chain does, and what keeps the sum
     * inside full scale there is `level`.
     */
    pluck(level = 1, dynamics = 1, position = 0, pickAngle = 0) {
      line.fill(0);
      x1 = 0;
      x2 = 0;
      delay = delayTarget; // a new note starts in tune, it does not glide into it

      // Zero-mean, and that is a fix rather than a nicety. The damping filter's
      // taps sum to exactly 1 at every brightness, so a DC offset in the
      // excitation decays at exactly `rho` and outlives every partial: the mean
      // of `P` uniform draws is a fresh random number of order 1/sqrt(P), and
      // it used to be what a broadband decay measurement ended up timing - one
      // pluck's t60 at 1760 Hz ranged 0.36 to 1.02 of the requested second, all
      // of it that residue. The comb below has a zero at DC and would remove it
      // too, but `position = 0` is a supported setting, so this is what carries
      // the property.
      burstLength = Math.floor(
        delay - phaseDelayCompensation - INTERPOLATOR_REACH,
      );
      let sum = 0;
      for (let i = 0; i < burstLength; i++) {
        const value = level * (Math.random() * 2 - 1);
        noise[i] = value;
        sum += value;
      }
      const mean = sum / burstLength;
      let peak = 0;
      for (let i = 0; i < burstLength; i++) {
        noise[i] -= mean;
        if (Math.abs(noise[i]) > peak) peak = Math.abs(noise[i]);
      }
      // Removing the mean moves every sample, so the burst can end up past the
      // amplitude that was asked for - by the mean, which for a five-sample
      // burst at 5 kHz is a quarter of full scale. Scaling it back preserves
      // the zero sum exactly (scaling a zero-sum signal keeps it zero-sum) and
      // restores the property the unshaped burst had: the excitation is never
      // louder than `level`.
      const limit = Math.abs(level);
      if (peak > limit) {
        const rescale = limit / peak;
        for (let i = 0; i < burstLength; i++) noise[i] *= rescale;
      }

      // A comb of less than one sample is not a bypass, it is silence:
      // `1 - z^0 = 0`. `floor(beta*P)` reaches 0 at the top of the range for
      // any beta below about 0.11, so this guard is required - and it makes
      // `position = 0` the natural neutral setting.
      combDelay = position > 0 ? Math.floor(position * delay) : 0;

      // Both poles are clamped to the ranges `params.ts` declares. An
      // `AudioParam` already clamps, so this is for a direct caller: a pole at
      // or above 1 here diverges, and a negative `dynamics` would make
      // `Math.pow` NaN - and either one poisons the delay line for the rest of
      // the note. It costs two comparisons per pluck.
      const pole = pickAngle > 0 ? Math.min(pickAngle, 0.9) : 0;
      pickCoefficient = 1 - pole;
      pickState = 0;

      // Smith's bilinear-transform design, verbatim from his effect.lib
      // listing. He picks the bilinear transform over impulse invariance
      // because "it gives more attenuation of high frequencies". The break
      // frequency is the fundamental, so `Lw = PI*f0/fs` is just `PI/delay`.
      const nyquistLevel = Math.pow(Math.min(Math.max(dynamics, 0), 1), 5 / 3);
      const Lw = Math.PI / delay;
      levelGain = Lw / (1 + Lw);
      levelPole = (1 - Lw) / (1 + Lw);
      levelDirect = nyquistLevel * Math.cbrt(nyquistLevel); // L * L0, L0 = L^(1/3)
      levelMix = 1 - nyquistLevel;
      levelState = 0;

      // The two one-poles have unity DC gain, so the finished excitation
      // integrates to zero only if their tails are allowed to run out. 60 dB
      // is enough: what truncation leaves behind is some 70 dB below the offset
      // the mean subtraction just removed.
      const slowestPole = Math.max(pole, levelMix > 0 ? levelPole : 0);
      const tail =
        slowestPole > 0
          ? Math.ceil(Math.log(1000) / -Math.log(slowestPole))
          : 0;
      excitationLength = burstLength + combDelay + tail;
      excitationIndex = 0;

      // The follower starts at 1 rather than at 0 - a zeroed envelope is below
      // the stop threshold and would end the note on its first sample. It
      // reaches the excitation's real level within 5 ms.
      envelope = 1;
      ringing = true;
    },

    /**
     * Renders `[from, to)` of one block. `delays`, when given, is the loop
     * length this string should have at each sample of the block, in samples,
     * indexed absolutely; without it the block interpolates towards whatever
     * `setDelay` last asked for.
     */
    process(
      output: Float32Array,
      from: number,
      to: number,
      delays?: ArrayLike<number>,
    ) {
      if (!ringing) {
        output.fill(0, from, to);
        return;
      }
      // Per-block parameter interpolation, (target - current)/blockSize: a
      // k-rate parameter steps once per 128 frames, and stepping a delay
      // length by a whole block's worth of change is a click.
      const increment =
        delays === undefined && to > from
          ? (delayTarget - delay) / (to - from)
          : 0;

      for (let i = from; i < to; i++) {
        // The loop length this sample wants to be. Everything that moves the
        // pitch of a ringing string goes through here - a-rate `frequency`
        // today, and the tension term ticket 11 adds - and it is clamped per
        // sample rather than per block, because a modulation source can ask
        // for anything.
        const wanted = delays === undefined ? delay + increment : delays[i];
        delay =
          wanted < MIN_LOOP_LENGTH
            ? MIN_LOOP_LENGTH
            : wanted > maxDelay
              ? maxDelay
              : wanted;
        // Pakarinen, Puputti and Valimaki 2008 compensate a moving read
        // pointer with one multiply, `pc(n) = (1 - x)*p(n)` for a delay-line
        // variation of `x` samples per time step, because "if the DWG string
        // is suddenly shortened to half of its original length ... 50 percent
        // of the signal energy is lost". It is deliberately not here, and the
        // reason is measured rather than argued - see the plan for ticket 06.
        // In their structure the multiply corrects a signal read out of the
        // line; inside a feedback loop it compounds once per round trip, which
        // makes it diverge to NaN on a fast modulation and over-damp a
        // downward slide by 6.6 dB when clamped to stop that. What keeps a
        // slide at the right level here is that `rho` is derived from the
        // current frequency, so the loop's loss per second follows the pitch:
        // a slid note measures within 1.2 dB of the same note held still.

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

        // The excitation chain, summed into the loop input. Three filters and
        // a level, none of them inside the loop: comb, then pick-direction
        // one-pole, then dynamic level. See `pluck` for what each one is.
        if (excitationIndex < excitationLength) {
          const e = excitationIndex++;
          let excitation = e < burstLength ? noise[e] : 0;
          const delayed = e - combDelay;
          if (combDelay > 0 && delayed >= 0 && delayed < burstLength) {
            excitation -= noise[delayed];
          }
          pickState += pickCoefficient * (excitation - pickState);
          levelState = levelGain * pickState + levelPole * levelState;
          sample += levelDirect * pickState + levelMix * levelState;
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
  // Scratch for the per-sample loop length when `frequency` is a-rate.
  // Allocated once and grown only if a host ever renders a longer block.
  let delays = new Float64Array(128);

  return (
    output: Float32Array,
    trigger: number | ArrayLike<number>,
    frequency: number | ArrayLike<number>,
    decay: number,
    // `params.ts` declares the same defaults, so a short call is the shipped
    // sound rather than an arbitrary one. The last four shape the excitation
    // and none of them touches the loop.
    brightness = 0.5,
    level = 0.5,
    dynamics = 0.5,
    position = 0.13,
    pickAngle = 0,
  ) => {
    // Smith 3.3: the loop filter is applied once per period, so -60 dB in
    // `decay` seconds needs `rho^(f0*decay) = 0.001`. Pitch-independent by
    // construction - which is the whole fix for a knob that used to be a count
    // of periods and so rang 15x longer at 110 Hz than at 1760 Hz.
    const length = output.length;
    // a-rate `frequency` is read per sample, in the same defensive form as the
    // trigger: the descriptor declares a-rate, but a host that has nothing
    // connected still hands over a single value, and then this is one read for
    // the whole block. An `Lfo` patched in gives vibrato and a `Param` ramp
    // gives portamento, which is why there is no glide parameter here.
    const perSample = typeof frequency !== "number" && frequency.length > 1;
    const firstFrequency =
      typeof frequency === "number" ? frequency : frequency[0];

    if (perSample) {
      const values = frequency as ArrayLike<number>;
      if (delays.length < length) delays = new Float64Array(length);
      for (let i = 0; i < length; i++) delays[i] = sampleRate / values[i];
    }
    // The loop length is set every block, not only on a rising edge, so the
    // pitch of a ringing string follows the parameter. `process` interpolates
    // towards it across the block.
    string.setDelay(sampleRate / firstFrequency);

    const periods = firstFrequency * decay;
    string.setDamping(
      periods > 0
        ? Math.min(Math.pow(targetAmplitude, 1 / periods), maxLoopGain)
        : 0, // a non-positive decay would invert the exponent and grow the loop
      brightness,
    );

    let start = 0;
    const render = (a: number, b: number) =>
      perSample
        ? string.process(output, a, b, delays)
        : string.process(output, a, b);

    // The rising edge is the whole anti-double-trigger rule: re-plucking needs
    // the trigger to return to <= 0 first, which is a genuine retrigger.
    if (typeof trigger === "number" || trigger.length <= 1) {
      // k-rate: one value for the block, tested once - what it cost before.
      const value = typeof trigger === "number" ? trigger : trigger[0];
      if (detectGate(value) === true) {
        string.pluck(level, dynamics, position, pickAngle);
      }
    } else {
      // a-rate: the block is rendered in segments split at the rising edges,
      // so a pluck scheduled mid-block starts mid-block instead of being
      // quantised to the render quantum (2.9 ms at 44.1 kHz).
      for (let i = 0; i < length; i++) {
        if (detectGate(trigger[i]) === true) {
          if (i > start) render(start, i);
          // A pluck starts in tune at whatever the pitch is *now*, rather than
          // gliding into it from the previous note.
          string.setDelay(perSample ? delays[i] : sampleRate / firstFrequency);
          string.pluck(level, dynamics, position, pickAngle);
          start = i;
        }
      }
    }

    render(start, length);
  };
}
