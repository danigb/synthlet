import { createGateDetector } from "./_gate";

// The string, as the literature draws it: Bank and Valimaki factor the loop
// into `Hl(z) = Hloss(z)*Hdisp(z)*Hfd(z)` and Smith's EKS listing puts the
// excitation chain *outside* it -
//
//   stringloop = (+ : fdelay4(Pmax, P-2)) ~ (loopfilter);
//   process = filtered_excitation : stringloop : ...
//
// - and this file is that shape. `Hloss` is Smith's EKS two-zero damping
// filter; `Hfd` is a fourth-order Lagrange read; `Hdisp` is Rauhala and
// Valimaki's tunable Thiran allpass. The excitation is Smith's three-filter
// chain, outside the loop. Every ticket filled in one block and carried one
// measurement.
//
// Deliberately not built on `scripts/_delay.ts`, synthlet's shared circular
// buffer: its fractional reads are linear and Hermite, and the read this
// package needs next is fourth-order Lagrange (Hermite is not in the paper
// corpus this package is implemented from). Consolidating the two is a
// repo-wide decision; this is written as if it were going to move.

// ---------------------------------------------------------------------------
// The loop's phase-delay budget.
//
// Every filter in the loop is paid for out of the loop length or the string
// detunes - Smith's `P - 2` is one sample for the damping FIR and one for the
// interpolator. The bookkeeping is written here once, not re-derived by each
// ticket that adds a filter, and it is now in three parts: two constants and
// one term that moves with pitch.
// ---------------------------------------------------------------------------

// Smith's EKS two-zero damping filter. Its impulse response is symmetric about
// n = 1, so its phase delay is exactly one sample at every frequency - which is
// why `brightness` can change the tone without detuning the string, and why the
// sample it costs can be subtracted from the loop length once rather than
// tracked per pitch.
const DAMPING_PHASE_DELAY = 1;

// The fourth-order Lagrange kernel is exact for a delay in [1.5, 2.5] samples
// measured from its newest tap, so the integer split rounds rather than floors
// and the read reaches 2.5 samples *newer* than its nominal position in the
// worst case. That reach costs no phase delay - the five taps implement a delay
// of exactly `readDistance` - but it does set the shortest loop the string can
// hold, and so the highest note it can play.
const INTERPOLATOR_REACH = 2.5;

// The shortest loop with no dispersion in it: the read's newest tap has to be a
// sample that has already been written, and the damping filter's sample comes
// out of the same budget. `params.ts` declares a `frequency.maxValue` this
// clamp can honour, and the dispersion cascade below is only allowed to engage
// while it still leaves this much loop behind.
const MIN_LOOP_BASE = INTERPOLATOR_REACH + 1 + DAMPING_PHASE_DELAY; // 4.5

// ---------------------------------------------------------------------------
// `Hdisp`: dispersion.
//
// Real strings are stiff. The bending term in the restoring force makes high
// partials travel faster, so partial `k` sits at `k*f0*sqrt(1 + B*k^2)` rather
// than at `k*f0` - `B` being the inharmonicity coefficient. That stretch is
// most of what separates a piano or a clavinet from a synthetic comb, and a
// pure delay line cannot produce any of it.
//
// The filter is Rauhala and Valimaki 2006, "Tunable Dispersion Filter Design
// for Piano Synthesis", SPL 13(5), section II: a cascade of second-order Thiran
// allpass sections whose coefficients come from `f0` and `B` in closed form,
// which is the only design in the corpus that a k-rate knob can drive - the
// alternatives need either a high-order optimisation or a redesign per note.
// Its equations are typeset images in that PDF and are in no text extraction of
// it; these were read off the rendered pages.
//
//   (1) a_k = (-1)^k (N choose k) prod_{n=0..N} (D-N+n)/(D-N+k+n)
//   (3) I_key(f) = log_{2^(1/12)}( f * 2^(1/12) / 27.5 )
//   (5) k_d(B) = exp( k1*(ln B)^2 + k2*ln B + k3 )
//   (6) C_d(B) = exp( C1*ln B + C2 )
//   (7) D(I_key, B) = exp( C_d(B) - I_key*k_d(B) )
//   (8) A(z) = ( (a2 + a1 z^-1 + z^-2) / (1 + a1 z^-1 + a2 z^-2) )^M
//
// with (1) at N = 2 - section II-D-1 says to derive the second-order case from
// it - giving `a1 = -2(D-2)/(D+1)` and `a2 = (D-2)(D-1)/((D+1)(D+2))`.
// Implemented against the paper's own Fig. 2 cases it reproduces their D values
// to within 5%, which is the least-squares fit's own residual.
//
// **Unity magnitude at every frequency**, so this block cannot change any
// partial's decay time: `Hloss` keeps sole ownership of that. What it changes
// is *where the partials are*, which is why it is not ticket 08's `stretch` and
// `stretch` is not it - that lengthens high-partial decay, this moves partial
// frequencies. Both ship.
const THIRAN_ORDER = 2; // N in (1)

// M in (8), and it is a measurement rather than a preference. The
// parameterization is fitted *per cascade length*: Table I has a column for
// M = 4 and one for M = 1, and no other, so an intermediate M is an unfitted
// design - two sections reusing the M = 4 column deliver half its dispersion
// delay and, by the paper's own criterion (II-B: consecutive partials within
// 0.5% of `k*f0*sqrt(1+Bk^2)`), 13 correct partials at 110 Hz and B = 1e-4
// against 37 for four sections and 21 for one.
//
// Four sections fit the bass best but `D` from (7) falls with pitch and
// saturates at N - the paper says so, "the values ... saturate at high
// frequencies toward two, which corresponds to the order N = 2" - and at D = 2
// the section is exactly `z^-2`, no dispersion at all. Measured, four sections
// stop dispersing at 569 Hz for a quarter of the knob and 1542 Hz at its top,
// where one section runs to 1275 Hz and 2795 Hz; and four sections need 4*D
// samples of loop, which at 1760 Hz is more than the whole 25-sample period.
//
// The paper switches cascades by key number (M = 4 for keys 1-44, M = 1 for
// 45-88). Not done here: at that boundary, 349 Hz, the two designs' dispersion
// delay is 17.6 samples against 7.5, and `frequency` is a-rate in this package
// precisely so notes can slide. A 2.3x step in timbre when a slide crosses F4
// is worse than a looser fit in the bass.
const DISPERSION_SECTIONS = 1;

// Table I, column `A_disp2` (N = 2, M = 1).
const DISPERSION_K1 = -0.002658;
const DISPERSION_K2 = -0.014811;
const DISPERSION_K3 = -2.9018;
const DISPERSION_C1 = 0.071089;
const DISPERSION_C2 = 2.1074;

// The `stiffness -> B` taper is **ours, and unsourced**. No paper in this
// corpus prescribes a knob mapping; the filter above is Rauhala and Valimaki's,
// this is a product decision, and it is written down here rather than dressed
// up with a citation.
//
// The *endpoints* do have a source: section II-B searched `B = r*10^k` for
// k = -5, -4, -3, so this two-decade span sits inside the range the paper
// explored for piano inharmonicity. The exponential *between* them is the
// product decision, chosen because inharmonicity in cents is very nearly linear
// in B, so a geometric taper gives even steps: the 16th partial of a 110 Hz
// string is 8.1 cents sharp at a quarter travel, 19.6 at half, 44.0 at three
// quarters and 91.8 at the top.
//
// The top is deliberately past a real string - a piano bass string is around
// B = 2e-4 - but not past the design: at B = 1e-2 the cascade puts the 8th
// partial 796 cents sharp where the physics wants 428, so 1e-3 is the last
// decade where it still tracks the curve it is fitted to.
//
// No audibility threshold is quoted for any of this. Jarvelainen, Valimaki and
// Karjalainen measured one (ARLO 2(3), 2001) and that paper is in the reading
// list's "Not obtained" section. What their companion studies do say is that
// thresholds vary strongly with f0, so a fixed taper is perceptually uneven
// across the keyboard - a comment, not a claim.
const DISPERSION_MIN_B = 1e-5;
const DISPERSION_MAX_B = 1e-3;

/** Nothing in the loop: `stiffness` at 0, or a loop too short to hold a section. */
const NO_DISPERSION = { a1: 0, a2: 0, phaseDelay: 0 };

/**
 * One second-order Thiran allpass section for a string of `delay` samples at
 * `frequency`, from Rauhala and Valimaki's (1) and (3)-(7) above, plus the
 * cascade's phase delay at the fundamental - which the loop has to lose, or
 * `stiffness` detunes the string.
 *
 * Exported for `dsp.test.ts` only; `index.ts` does not re-export it, so it is
 * not public API.
 *
 * `D` is clamped at both ends and for different reasons.
 *
 * - **Below, at N.** A second-order Thiran allpass is stable only for
 *   `D > N - 1`, and at `D = 1` exactly `a1 = 1` and `a2 = 0` - a pole on the
 *   unit circle, and an unstable filter inside a feedback loop is unbounded.
 *   Below `D = N` it is also wrong-signed: the phase delay would rise with
 *   frequency and flatten the partials rather than sharpen them. `D = N` is
 *   where the parameterization saturates anyway, and there the section is
 *   exactly `z^-2` - a pure two-sample delay that the compensation absorbs.
 * - **Above, at what the loop can spare.** `M * phaseDelay` comes out of the
 *   loop length, so it cannot exceed `delay - MIN_LOOP_BASE` or the burst has
 *   no room and the string cannot hold its pitch. Swept over the declared
 *   ranges at 1% steps this clamp never binds - the taper's top asks for 195.7
 *   samples at 20 Hz where 2200 are available, and by the time the loop is
 *   short enough to matter `D` has already saturated to 2 - so it ships as a
 *   guard rather than as a mechanism.
 *
 * The phase delay is exact rather than the paper's own shortcut. Section
 * II-D-2 says `D` itself, the phase delay at dc, is "a satisfactory
 * approximation" for the phase delay at f0, and it is: the worst gap over the
 * declared grid is 0.026 samples, which is 0.067 cents of detuning. One
 * `atan2` per block is free next to the three `exp` the parameterization
 * already costs, and it removes the one term that would otherwise have to be
 * argued rather than measured. `A(z) = z^-N * Dr(1/z)/Dr(z)` with
 * `Dr(z) = 1 + a1 z^-1 + a2 z^-2`, so the phase is `-N*w - 2*arg Dr(e^jw)` and
 * the phase delay is `N + 2*arg Dr(e^jw)/w`.
 */
export function designDispersion(
  sampleRate: number,
  frequency: number,
  stiffness: number,
  delay: number,
) {
  const budget = (delay - MIN_LOOP_BASE) / DISPERSION_SECTIONS;
  if (!(stiffness > 0) || budget < THIRAN_ORDER) return NO_DISPERSION;

  const b =
    DISPERSION_MIN_B *
    Math.pow(
      DISPERSION_MAX_B / DISPERSION_MIN_B,
      stiffness > 1 ? 1 : stiffness,
    );
  const lnB = Math.log(b);
  const kd = Math.exp(
    DISPERSION_K1 * lnB * lnB + DISPERSION_K2 * lnB + DISPERSION_K3,
  ); // (5)
  const cd = Math.exp(DISPERSION_C1 * lnB + DISPERSION_C2); // (6)
  // (3): `log_{2^(1/12)}(f * 2^(1/12) / 27.5)`, which is A0 = 27.5 Hz at key 1
  // and A4 = 440 Hz at key 49.
  const key = 12 * Math.log2(frequency / 27.5) + 1;
  const target = Math.exp(cd - key * kd); // (7)
  const d =
    target < THIRAN_ORDER ? THIRAN_ORDER : target > budget ? budget : target;

  // (1) at N = 2.
  const a1 = (-2 * (d - THIRAN_ORDER)) / (d + 1);
  const a2 = ((d - THIRAN_ORDER) * (d - 1)) / ((d + 1) * (d + THIRAN_ORDER));

  const w = (2 * Math.PI * frequency) / sampleRate;
  const real = 1 + a1 * Math.cos(w) + a2 * Math.cos(2 * w);
  const imaginary = -(a1 * Math.sin(w) + a2 * Math.sin(2 * w));
  const phaseDelay =
    DISPERSION_SECTIONS *
    (THIRAN_ORDER + (2 * Math.atan2(imaginary, real)) / w);

  return { a1, a2, phaseDelay };
}

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
  // The summed phase delay of every loop element that is *not* the read - see
  // the budget block above the constants. The damping filter's one sample, and
  // once `stiffness` is off zero the dispersion cascade's own, which is a
  // function of pitch and so has to be recomputed rather than declared.
  let phaseDelayCompensation = DAMPING_PHASE_DELAY;

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
  // Its reach, and what that costs, is `INTERPOLATOR_REACH` above.
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
  // play. `MIN_LOOP_BASE` while the cascade is bypassed, which is the default;
  // `stiffness` raises it by what the cascade takes, and `setDispersion` is
  // what keeps the two in step.
  let minLoopLength = MIN_LOOP_BASE;

  // Smith's EKS two-zero damping filter, `rho * (h0*x' + h1*(x + x''))`, and
  // the one thing that makes this Karplus-Strong rather than a leaky comb: it
  // is what makes high partials die before low ones. Its phase delay is
  // `DAMPING_PHASE_DELAY`, one sample at every frequency, and that is why
  // `brightness` can change the tone without detuning the string.
  let rho = 0;
  let h0 = 1;
  let h1 = 0;
  let x1 = 0; // x[n-1]
  let x2 = 0; // x[n-2]

  // `Hdisp`: one second-order Thiran allpass section, `dispersionSections` of
  // them in cascade, designed per block by `setDispersion`. `dispersing` is
  // false at `stiffness = 0`, and then this whole block - state, multiplies and
  // the sample it would cost the loop - is skipped, so the default path is the
  // one ticket 08 left, sample for sample.
  let dispersing = false;
  let da1 = 0;
  let da2 = 0;
  let dx1 = 0;
  let dx2 = 0;
  let dy1 = 0;
  let dy2 = 0;

  // Karplus and Strong's own two probabilistic variants, from the paper this
  // package is named after - the ones its title is about, "Plucked-String *and
  // Drum* Timbres":
  //
  //   stretch: y[t] = y[t-p]                    with probability 1 - 1/S
  //            y[t] = (y[t-p] + y[t-p-1])/2     with probability 1/S
  //   blend:   y[t] = +(y[t-p] + y[t-p-1])/2    with probability b
  //            y[t] = -(y[t-p] + y[t-p-1])/2    with probability 1 - b
  //
  // and their combined form, on which they note: "the stretch factor and blend
  // factor are independent, so the algorithm can be implemented with two
  // separate tests, and no multiplies are needed". Two tests is what this is.
  //
  // The thresholds are integers, compared against a 32-bit generator, so the
  // hot path has no division and no float compare. Each has its own flag
  // rather than a sentinel value, because `blend = 0` - the "harplike" case
  // that negates *every* sample - is a threshold of zero and a real setting.
  let stretchThreshold = 0; // 1/S as a 32-bit fraction
  let stretching = false;
  let blendThreshold = 0; // b as a 32-bit fraction
  let blending = false;
  let probabilistic = false; // neither active: the whole branch is skipped

  // A private xorshift32, seeded lazily from `Math.random` the first time a
  // coin is actually flipped after a pluck. Private because it is 3x cheaper
  // (measured: 1.35 ns a call against `Math.random`'s 4.05, 50M calls) but
  // mostly because it is *separate*: the loop's coin flips do not consume the
  // sequence the excitation draws its noise from, so a default note is
  // bit-identical to one from before this existed, and a seeded measurement of
  // the excitation still measures the excitation.
  let rngState = 1;
  let rngSeeded = false;
  const nextRandom = () => {
    rngState ^= rngState << 13;
    rngState ^= rngState >>> 17;
    rngState ^= rngState << 5;
    return (rngState >>>= 0);
  };

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
  // Tension modulation: the pluck stretches the string, the tension rises, the
  // pitch rises with it, and it all slides back down as the vibration decays.
  //
  // Avanzini, Marogna and Bank 2012 - "the short-time average of the tension
  // variation, which is responsible for pitch glides, is approximately
  // proportional to the system energy" - and their section V-B's *energy
  // storage model* is what makes it cost one multiply here rather than the
  // elongation sum Tolonen et al. 2000 need, which is "hundreds of addition and
  // multiplication operations per sampling interval" and gets worse as the
  // pitch falls:
  //
  //   "if an initial displacement and/or velocity distribution is given (e.g., a
  //   triangle-shaped initial displacement for an ideally plucked string), then
  //   dE[n] = 0; the initial value E[0] is set to the energy of the initial
  //   state of the system, and the discrete-time energy E[n] decays
  //   exponentially from the initial value."
  //
  // Which is this package exactly: the excitation is a burst summed in at the
  // pluck, not a continuous driver. So `energy` is seeded from the burst and
  // then decays, and it is **open loop** - the loop's own signal never enters
  // it. That is the stability argument. The delay cannot be driven by the delay,
  // there is no path by which the modulation feeds energy into the string (which
  // is what limits Pakarinen et al. 2005's model, section 7), and no gain term
  // is needed anywhere - ticket 06's rejected `gc = 1 - x` compensation multiply
  // stays rejected.
  let tensioning = false;
  let tensionAmount = 0;
  let energy = 0; // E[n], the mean square of the burst decaying
  let energyDecay = 0; // lambda, from the loop's own dissipation

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
      delayTarget = Math.min(Math.max(samples, minLoopLength), maxDelay);
    },

    /**
     * `Hdisp`: the dispersion cascade, designed for this block's pitch.
     *
     * Call it **before** `setDelay`, which clamps against the loop floor this
     * moves. Block-rate rather than per-sample for the same reason `rho` is:
     * three `exp` and an `atan2` once per 128 samples is free, once per sample
     * is more than the filter costs. The consequence is worth writing down -
     * with `stiffness` above zero the loop floor rises, so inside a single
     * block an a-rate modulation cannot reach as far *above* the block's first
     * frequency as it could at zero. Any modulation slower than one render
     * quantum never sees it, because the first frequency tracks the modulation.
     */
    setDispersion(stiffness: number, frequency: number) {
      const design = designDispersion(
        sampleRate,
        frequency,
        stiffness,
        Math.min(sampleRate / frequency, maxDelay),
      );
      da1 = design.a1;
      da2 = design.a2;
      dispersing = design.phaseDelay > 0;
      phaseDelayCompensation = DAMPING_PHASE_DELAY + design.phaseDelay;
      minLoopLength = INTERPOLATOR_REACH + 1 + phaseDelayCompensation;
    },

    /**
     * How far the pluck's own energy shortens the loop, and how fast that
     * shortening decays.
     *
     * `decayPerSample` is passed in rather than derived here so that two
     * polarizations share one trajectory: tension is a property of the string,
     * not of a plane of vibration, and the second loop's `rho` is three times
     * slower by design. Letting each derive its own would model two tensions in
     * one string and let the two planes drift apart as the note rings.
     */
    setTension(amount: number, decayPerSample: number) {
      tensioning = amount > 0;
      tensionAmount = tensioning ? Math.min(amount, 1) : 0;
      energyDecay = decayPerSample;
    },

    /**
     * The loss chain: `gain` is the once-per-period loop gain and
     * `brightness` splits it across frequency. B = 1 gives `[0, 1, 0]`, a bare
     * one-sample delay damped only by `gain`; B = 0 gives `[1/4, 1/2, 1/4]`,
     * the raised cosine with a zero at Nyquist. DC gain is `h0 + 2*h1 = 1` for
     * every B, so brightness moves the rolloff and never the decay time.
     */
    setDamping(gain: number, brightness: number, stretch = 1, blend = 1) {
      rho = gain;
      h0 = (1 + brightness) / 2;
      h1 = (1 - brightness) / 4;
      // `1/S` and `b` as 32-bit fractions, compared against a uniform draw
      // over [0, 2^32). `stretch = 1` and `blend = 1` are the neutral
      // settings: both flags go false and the loop is untouched, which is what
      // makes the default path cost exactly what it did before.
      stretching = stretch > 1;
      stretchThreshold = stretching
        ? (4294967296 / Math.min(stretch, 1e6)) >>> 0
        : 0;
      blending = blend < 1;
      blendThreshold = blending ? (4294967296 * Math.max(blend, 0)) >>> 0 : 0;
      probabilistic = stretching || blending;
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
     *
     * `draws` replaces the burst's `Math.random()` with uniform values in
     * [-1, 1) supplied by the caller, which is how two of these closures become
     * two *polarizations of one string* rather than two notes - Laurson et al.
     * 2001: "Two basic string models of Figure 1 are used for each guitar
     * string... They feed both from the same excitation." Omitted, this draws
     * for itself exactly as it always has. Each string still removes its own
     * burst's mean over its own burst length, because the two lengths differ by
     * the detuning and by the dispersion compensation.
     */
    pluck(
      level = 1,
      dynamics = 1,
      position = 0,
      pickAngle = 0,
      draws?: ArrayLike<number>,
    ) {
      line.fill(0);
      x1 = 0;
      x2 = 0;
      dx1 = 0;
      dx2 = 0;
      dy1 = 0;
      dy2 = 0;
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
      // A blended loop is loaded with a *constant*, which is Karplus and
      // Strong's own Fig. 4: "the initial wavetable can be filled with a
      // constant (A), since the drum algorithm will create the randomness
      // itself... starting with a constant gives some buildup before the
      // decay, while starting with randomness gives maximum amplitude
      // initially. Blends near 1 require nonconstant initial loading of the
      // wavetable, as little or no randomness is introduced."
      //
      // The zero-mean subtraction below is skipped for it, and has to be - the
      // mean of a constant is the constant, and removing it leaves silence.
      // It is also unnecessary: the dc residue it exists to remove is a mode
      // of a loop that preserves dc, and a loop that flips sign at random has
      // no such mode. (The pick-position comb does annihilate a constant,
      // `x[n] - x[n-D]` being zero wherever the burst is flat, so a drum voice
      // wants `position` at 0.)
      if (blending) {
        noise.fill(level, 0, burstLength);
      } else {
        let sum = 0;
        for (let i = 0; i < burstLength; i++) {
          const value =
            level * (draws === undefined ? Math.random() * 2 - 1 : draws[i]);
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
      }

      // `E[0]`, the energy the pluck put in - the burst's **mean square**, read
      // off the samples `pluck` has just written, so it is what actually goes
      // into the loop rather than what was asked for. Mean rather than sum on
      // purpose: the sum grows with the burst length, so a 20 Hz note would get
      // a hundred times a 5 kHz note's "energy" and `tension` would mean
      // something different at every pitch. The mean square is `level^2/3` for
      // the noise burst at every pitch, which keeps the knob pitch-independent
      // and the glide proportional to `level^2` - a soft pluck gliding less than
      // a hard one being the entire physical point.
      if (tensioning && burstLength > 0) {
        let squares = 0;
        for (let i = 0; i < burstLength; i++) squares += noise[i] * noise[i];
        energy = squares / burstLength;
      } else {
        energy = 0;
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
      // A fresh coin sequence per note, drawn only if a coin is flipped.
      rngSeeded = false;

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
          wanted < minLoopLength
            ? minLoopLength
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

        // Tension modulation, applied to the *read* rather than to `delay`.
        // `delay` keeps meaning "the loop length this sample was asked for" -
        // it is what `setDelay` clamps, what the block interpolates towards and
        // what `pluck` derives the burst length from - so nothing downstream of
        // it has to be re-derived.
        //
        // The factor is in (0, 1] by construction and the result is clamped
        // again, so the modulated read is bounded whatever `tension` is asked
        // for. Avanzini et al.'s energy decays with the system's own
        // dissipation, which here is `rho`: amplitude falls as `rho^(1/P)` per
        // sample and energy, being amplitude squared, as `rho^(2/P)`. That is
        // also Jarvelainen and Valimaki 2001's own stimulus rule - "the time
        // constant of the frequency descent was 50% of the overall time constant
        // of amplitude decay" - so the contour matches their Fig. 2 by
        // construction rather than by tuning. Two papers, one number.
        let effective = delay;
        if (energy > TENSION_FLOOR) {
          energy *= energyDecay;
          effective = delay * (1 - tensionAmount * energy);
          if (effective < minLoopLength) effective = minLoopLength;
        } else if (energy !== 0) {
          // Below the floor the glide is over, and stopping here is worth a
          // branch: a modulated delay changes its fractional part every sample,
          // so the five-tap Lagrange kernel is recomputed every sample instead
          // of never - measured, that is 27 of the 47 ns a tension-enabled
          // sample costs, and it would otherwise go on for the whole note for a
          // pitch shift of a thousandth of a cent. `TENSION_FLOOR` is reached at
          // about three quarters of `decay`.
          energy = 0;
        }

        let readIndex = writeIndex - (effective - phaseDelayCompensation);
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
        let filtered = h0 * x1 + h1 * (sample + x2);
        let sign = 1;
        if (probabilistic) {
          // Seeded on first use rather than at every pluck, so a note that
          // never flips a coin never touches `Math.random` - which is what
          // makes the default path bit-identical - while a note whose
          // `stretch` is automated up mid-ring still gets a fresh sequence.
          if (!rngSeeded) {
            rngState = (Math.random() * 4294967296) >>> 0 || 1;
            rngSeeded = true;
          }
          // Stretch: skip the damping filter, keeping `x1` - which is the same
          // one sample of delay the filter has, so the loop length does not
          // move with `S` and the string does not detune. K&S's period shifts
          // from `p + 1/2` to `p + 1/(2S)` because their averager carries half
          // a sample; ticket 04's symmetric three-tap carries exactly one at
          // every frequency, and so does this branch.
          if (stretching && nextRandom() >= stretchThreshold) {
            filtered = x1;
          }
          // Blend: negate the loop signal with probability 1 - b. A second,
          // independent draw, as the paper's combined recurrence requires.
          if (blending && nextRandom() >= blendThreshold) {
            sign = -1;
          }
        }
        // Both branches have magnitude at most 1 at every frequency - `G(w)`
        // when the filter runs, exactly 1 when it is skipped or negated - so
        // the loop is still a contraction whenever `rho < 1`, and `rho` stays
        // *outside* the coin flip on purpose: inside, `stretch` would multiply
        // the whole decay and `decay` would stop being a time in seconds.
        // Outside, `decay` is the ceiling and `stretch` lengthens only what
        // the damping filter shortens, which is the high partials.
        let feedback = sign * rho * filtered;
        x2 = x1;
        x1 = sample;

        // `Hdisp`, last in the loop. `Hloss*Hdisp*Hfd` is a product of LTI
        // blocks so the order is free, and putting it here leaves the damping
        // filter's `x1`/`x2` holding pre-dispersion reads - which is what makes
        // the two probabilistic branches above mean exactly what they did.
        //
        // An allpass has magnitude exactly 1 at every frequency, so the loop's
        // per-trip gain is still at most `rho < 1` and the contraction bound
        // survives untouched. That is also why this cannot change any partial's
        // decay time: it moves partials, it does not damp them.
        if (dispersing) {
          for (let section = 0; section < DISPERSION_SECTIONS; section++) {
            const dispersed =
              da2 * feedback + da1 * dx1 + dx2 - da1 * dy1 - da2 * dy2;
            dx2 = dx1;
            dx1 = feedback;
            dy2 = dy1;
            dy1 = dispersed;
            feedback = dispersed;
          }
        }

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

// ---------------------------------------------------------------------------
// Two polarizations.
//
// A real string vibrates in two planes at once, and they couple to the bridge
// differently. Jarvelainen and Karjalainen 2002 section 2 - read off the
// rendered pages, this paper's text layer is mis-encoded - is the whole design:
//
//   "because of unequal bridge impedance seen by the polarization components,
//   they have slightly different decay times. The horizontal polarization is
//   dominant at first, having a much higher initial amplitude than the vertical
//   component. However, it is decaying faster than the vertical component,
//   which after a while becomes dominant. Thus the fast decaying but louder
//   'prompt sound' is followed by the more sustained 'aftersound'."
//
//   "The unequal bridge impedance also causes a difference in the effective
//   lenght of the string between the vertical and horizontal components. This
//   results in a slight difference in the corresponding fundamental
//   frequencies, which can be observed as beating."
//
// So the louder component is the faster one, which fixes every sign here: the
// loop that carries most of the mix keeps `decay`'s own `rho`, and the second
// loop is both quieter and slower. The mix parameter and the decay difference
// are therefore one knob rather than two - which is what their section 6 says
// they are: "If the polarization components are made equally strong, the
// two-stage decay cannot be implemented at all."
// ---------------------------------------------------------------------------

// How much longer the weak polarization rings. Their section 6 says
// "differences between 30 % and 90 % in the time constants of the horizontal
// and vertical components were allowed perceptually", which is ambiguous about
// what the percentage is of; Fig. 7's caption is not, and it is what pins this
// number - they tested `t_h = 0.30 s` against `t_v = 0.54...1.7 s`, a ratio of
// 1.8 to 5.7. Three is inside that on either reading, and it is the smallest
// round number that makes the effect exist: modelled, the early-to-late decay
// rate ratio at a 7 dB level difference is 1.60 at twice the time constant,
// 1.87 at 2.5 and 2.14 at three.
//
// It is not free. The aftersound outlasts `decay` - about 2x at a useful mix,
// 2.7x at equal strength - because `decay` is applied to the *prompt* sound,
// which is the component it belongs to. Ticket 02's decay assertions are
// unaffected: they run at `polarization = 0`, where there is no second loop.
//
// `rho = 0.001^(1/(f0*t60))`, so three times the time constant is `rho^(1/3)`.
const POLARIZATION_TIME_CONSTANT = 3;

// `detune` in cents rather than in Hz, because the mechanism above is a
// difference in *effective length* and a length difference is a constant
// relative frequency difference. So the beat rate scales with pitch, which is
// what a real string does: 0.64 Hz at 110 Hz, 2.5 Hz at 440, 10.2 Hz at 1760.
//
// The range is **ours and unsourced**, the same kind of product decision as
// ticket 09's stiffness taper - no paper in this corpus prescribes one.
const MAX_DETUNE_CENTS = 10;

// How far `tension` may shorten the loop, per unit of burst energy. The factor
// of 3 turns the noise burst's mean square (`level^2/3`) back into `level^2`,
// so `tension` 1 on a full-scale pluck is exactly one semitone of initial
// sharpening.
//
// The **mapping is ours and unsourced** - the papers give thresholds, not knob
// tapers - but every point on it is checkable against a measured number.
// Jarvelainen and Valimaki 2001 measured detection thresholds of 3.1 / 4.4 /
// 5.4 / 11.7 Hz at 116.5 / 196 / 349.23 / 659.26 Hz; this taper puts a
// full-level pluck at
//
//   tension 0.1 -> 10 cents: 0.7 / 1.1 / 2.0 / 3.8 Hz, under every threshold,
//                  and the recorded electric guitar of their Fig. 1 (499 ->
//                  496 Hz, "approximately 3 Hz") sits here
//   tension 0.5 -> 49 cents: 3.4 / 5.7 / 10.1 / 19.0 Hz, over every threshold
//   tension 1   -> 100 cents: 6.9 / 11.6 / 20.7 / 39.1 Hz, 2.2 to 3.3x them
//
// so the knob spans inaudible to unmistakable, which is what a parameter whose
// physical setting sits near the detection threshold has to do to be worth
// having.
const TENSION_GAIN = 3 * (1 - Math.pow(2, -1 / 12));

// The energy below which the glide is declared over. `TENSION_GAIN` is 0.168,
// so this is a pitch shift of 1.7e-6 - about a thousandth of a cent - and
// stopping there hands the loop back its constant-delay fast path for the rest
// of the note. See the comment at the modulation itself for what that is worth.
const TENSION_FLOOR = 1e-5;

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

  // The second polarization, and everything it needs, allocated on the first
  // block that asks for it. A patch that never turns `polarization` up never
  // pays the second delay line's 8.8 KB, never fills a shared burst and never
  // runs a mix pass - which is what makes the default path bit-identical rather
  // than merely equivalent.
  let second: ReturnType<typeof createString> | undefined;
  let draws: Float64Array | undefined; // one burst, shared by both loops
  let detunedDelays: Float64Array | undefined; // a-rate, for the second loop
  let mix: Float32Array | undefined; // the second loop's own output block

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
    // And these three are inside the loop - Karplus and Strong's own two
    // variants and the dispersion cascade. All neutral by default, so the
    // shipped string is the one ticket 04 built.
    stretch = 1,
    blend = 1,
    stiffness = 0,
    // And these two are the second polarization. `polarization: 0` is one
    // string and costs exactly what one string cost.
    detune = 0.5,
    polarization = 0,
    // And this one drives the loop length from the pluck's own energy.
    tension = 0,
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
    // The dispersion cascade is designed first, because it owns a share of the
    // loop length and `setDelay` clamps against what is left.
    string.setDispersion(stiffness, firstFrequency);
    // The loop length is set every block, not only on a rising edge, so the
    // pitch of a ringing string follows the parameter. `process` interpolates
    // towards it across the block.
    string.setDelay(sampleRate / firstFrequency);

    const periods = firstFrequency * decay;
    const rho =
      periods > 0
        ? Math.min(Math.pow(targetAmplitude, 1 / periods), maxLoopGain)
        : 0; // a non-positive decay would invert the exponent and grow the loop
    string.setDamping(rho, brightness, stretch, blend);

    // Avanzini et al.'s `lambda`, "determined by the system dissipation": `rho`
    // is the loop's gain once per period, so amplitude falls as `rho^(1/P)` per
    // sample and energy, being its square, as `rho^(2/P)`. Computed once here
    // and handed to both polarizations, so the pair shares one tension.
    const tensionAmount = tension > 0 ? Math.min(tension, 1) * TENSION_GAIN : 0;
    const energyDecay =
      tensionAmount > 0 && rho > 0
        ? Math.pow(rho, (2 * firstFrequency) / sampleRate)
        : 0;
    string.setTension(tensionAmount, energyDecay);

    // The second polarization: quieter by `polarization`, slower by
    // `POLARIZATION_TIME_CONSTANT`, and sharp by `detune`. Sharp rather than
    // flat so its loop is the *shorter* of the two, which is what lets one
    // shared burst sized from the first loop cover both.
    const amount = polarization > 0 ? Math.min(polarization, 1) : 0;
    const dual = amount > 0;
    const ratio = Math.pow(
      2,
      (MAX_DETUNE_CENTS * Math.min(Math.max(detune, 0), 1)) / 1200,
    );
    if (dual) {
      if (second === undefined) second = createString(sampleRate, minFrequency);
      const detuned = firstFrequency * ratio;
      if (perSample) {
        if (detunedDelays === undefined || detunedDelays.length < length) {
          detunedDelays = new Float64Array(length);
        }
        for (let i = 0; i < length; i++) detunedDelays[i] = delays[i] / ratio;
      }
      second.setDispersion(stiffness, detuned);
      second.setDelay(sampleRate / detuned);
      second.setDamping(
        rho > 0
          ? Math.min(Math.pow(rho, 1 / POLARIZATION_TIME_CONSTANT), maxLoopGain)
          : 0,
        brightness,
        stretch,
        blend,
      );
      second.setTension(tensionAmount, energyDecay);
      if (mix === undefined || mix.length < length) {
        mix = new Float32Array(length);
      }
    }

    // One burst, drawn here and handed to both loops, so the two are two
    // polarizations of one pluck rather than two notes. Sized from the first
    // loop, which is the longer of the two; each string uses the prefix its own
    // burst length asks for. Not drawn at all while `dual` is false, which is
    // what keeps the single-polarization path's `Math.random` sequence - and so
    // its samples - identical to the pre-ticket one.
    const excite = (loopLength: number) => {
      if (!dual) {
        string.pluck(level, dynamics, position, pickAngle);
        return;
      }
      const wanted = Math.min(
        Math.ceil(loopLength),
        Math.ceil(sampleRate / minFrequency),
      );
      if (draws === undefined || draws.length < wanted) {
        draws = new Float64Array(Math.ceil(sampleRate / minFrequency));
      }
      for (let i = 0; i < wanted; i++) draws[i] = Math.random() * 2 - 1;
      string.pluck(level, dynamics, position, pickAngle, draws);
      second!.pluck(level, dynamics, position, pickAngle, draws);
    };

    let start = 0;
    const render = (a: number, b: number) => {
      if (!dual) {
        if (perSample) string.process(output, a, b, delays);
        else string.process(output, a, b);
        return;
      }
      if (perSample) {
        string.process(output, a, b, delays);
        second!.process(mix!, a, b, detunedDelays!);
      } else {
        string.process(output, a, b);
        second!.process(mix!, a, b);
      }
      // A convex combination, and that is the amplitude bound: the weights sum
      // to 1, so the mix can never exceed the louder of the two strings. It is
      // also why `polarization` is not a volume knob - the two loops are near
      // copies of each other, so their weighted mean sits at one string's level
      // instead of summing to two.
      const norm = 1 / (1 + amount);
      for (let i = a; i < b; i++) {
        output[i] = (output[i] + amount * mix![i]) * norm;
      }
    };

    // The rising edge is the whole anti-double-trigger rule: re-plucking needs
    // the trigger to return to <= 0 first, which is a genuine retrigger.
    if (typeof trigger === "number" || trigger.length <= 1) {
      // k-rate: one value for the block, tested once - what it cost before.
      const value = typeof trigger === "number" ? trigger : trigger[0];
      if (detectGate(value) === true) {
        excite(sampleRate / firstFrequency);
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
          const at = perSample ? delays[i] : sampleRate / firstFrequency;
          string.setDelay(at);
          if (dual)
            second!.setDelay(perSample ? detunedDelays![i] : at / ratio);
          excite(at);
          start = i;
        }
      }
    }

    render(start, length);
  };
}
