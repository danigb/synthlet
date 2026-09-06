import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `X.descriptors`.
export const PARAMS: readonly ParamDescriptor[] = [
  {
    name: "trigger",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // The top is measured, not declared. Above about 5 kHz the loop is under
    // nine samples long, holds four partials and is excited by a burst of
    // five, and the pitch stops being reliable: the worst of 16 plucks lands
    // 2.1 cents out at 5000 Hz, 8.3 at 5500 and 21 at 6000. 5 kHz is the
    // highest round number that holds inside the 5 cent tolerance every time.
    // The old 20000 was 2.2 samples of delay, which is not a string.
    // a-rate, so the pitch can move while the string rings: an `Lfo` into it
    // is vibrato, a `Param` ramp is portamento, and neither needs a parameter
    // of its own here. A host with nothing connected still hands the processor
    // one value per block, which costs exactly what k-rate did.
    name: "frequency",
    defaultValue: 440,
    minValue: 20,
    maxValue: 5000,
    automationRate: "a-rate",
  },
  {
    // Seconds: the time the string takes to fall 60 dB, at every pitch. It
    // used to be a count of periods, so the same knob position rang for 3.2 s
    // at 110 Hz and 0.22 s at 1760 Hz.
    name: "decay",
    defaultValue: 1,
    minValue: 0.01,
    maxValue: 5,
    automationRate: "k-rate",
  },
  {
    // How fast the high partials die relative to the low ones - the tilt of
    // the loop filter, not its overall loss. 1 is the brightest the loop can
    // be (the damping filter degenerates to a plain delay and only `decay`
    // remains); 0 is the maximum damping a three-tap symmetric FIR can apply,
    // a zero at Nyquist.
    name: "brightness",
    defaultValue: 0.5,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  // The four below shape the excitation, and every one of them is a filter or
  // a gain *outside* the feedback loop - Smith's EKS chain,
  // `excitation : smooth(pickangle) : pickposfilter : levelfilter(L,freq)` -
  // so none of them can change the decay time or destabilise the string.
  {
    // How hard the string is plucked, as a plain amplitude on the burst. It
    // used to be unconditionally 1: a pluck was a 0 dBFS noise transient
    // whatever the patch's gain staging. The default leaves headroom for a
    // patch that sums several voices, and for the comb below, whose peak gain
    // is 2: a `level` of 1 with the comb enabled reaches 1.99, where the
    // shipped defaults peak at about 0.21.
    name: "level",
    defaultValue: 0.5,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // Smith 3.5: "in real strings, the spectral centroid typically rises as
    // plucking/striking becomes more energetic". This is that filter, a
    // one-pole breaking at the fundamental, panned against its own input.
    // Mapped to his Nyquist-limit level `L` as `L = dynamics^(5/3)`, the
    // exponent that puts his default of -10 dB at the midpoint of the knob; 1
    // bypasses the filter and 0.126 is his -60 dB extreme. Soft plucks are
    // darker, and the decay time is untouched because none of this is in the
    // loop.
    name: "dynamics",
    defaultValue: 0.5,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // Where along the string it is plucked - Smith 3.2's comb filter
    // `1 - z^-floor(beta*P)`, with 0 at the bridge. The first notch lands at
    // `f0/position`, so 0.13 (his default) empties the region around the 7th
    // partial. **0 bypasses the comb**: `floor(beta*P)` reaches 0 for a small
    // beta at a high pitch, and `1 - z^0` is silence rather than a bypass.
    name: "position",
    defaultValue: 0.13,
    minValue: 0,
    maxValue: 0.5,
    automationRate: "k-rate",
  },
  {
    // Smith 3.1's pick-direction one-pole, `(1-p)/(1 - p*z^-1)`: "real up-picks
    // may be at different angles than down-picks, thus resulting in different
    // plucking stiffness". Unity DC gain, so it dulls the attack without
    // changing the level. Alternating it per note is a caller's job.
    name: "pickAngle",
    defaultValue: 0,
    minValue: 0,
    maxValue: 0.9,
    automationRate: "k-rate",
  },
  // And these two are inside the loop: Karplus and Strong's own probabilistic
  // variants, from the 1983 paper this package is named after. Both are
  // neutral at their defaults, and both cost one random number per sample and
  // no multiplies - "the stretch factor and blend factor are independent, so
  // the algorithm can be implemented with two separate tests".
  {
    // Their decay stretching: apply the damping filter with probability 1/S
    // and pass the sample through unchanged otherwise, so "the decay time of
    // each overtone is approximately multiplied by S". `decay` is still the
    // ceiling - the loop gain is applied every round trip whatever the coin
    // says - so what this lengthens is the high end, which is what the damping
    // filter shortens. 1 is the unstretched algorithm; their S = infinity,
    // where "the sound does not decay; this is simple wavetable synthesis", is
    // what the top of this range approaches.
    //
    // It is *not* `stiffness`: this lengthens high-partial decay, dispersion
    // moves partial frequencies. Different effects, both shipping.
    name: "stretch",
    defaultValue: 1,
    minValue: 1,
    maxValue: 20,
    automationRate: "k-rate",
  },
  {
    // Their drum algorithm, discovered by Kevin Karplus in December 1979:
    // negate the loop signal with probability 1 - b. "With a blend factor of
    // 1, the algorithm reduces to the basic plucked-string algorithm, with p
    // controlling the pitch. With a blend factor of 1/2, the sound is
    // drumlike. Intermediate values produce sounds intermediate between
    // plucked string and drum." At 1/2 the buffer length stops controlling
    // pitch and starts controlling the decay of the noise burst; at 0 the
    // signal is negated every period, which drops the pitch an octave and
    // leaves only odd harmonics - their "harplike" case.
    name: "blend",
    defaultValue: 1,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // How stiff the string is: `Hdisp`, the third block of Bank and Valimaki's
    // loop filter, and the one that makes the partial series inharmonic. A real
    // string's bending stiffness makes high partials travel faster, so partial
    // `k` sits at `k*f0*sqrt(1 + B*k^2)` instead of at `k*f0`, and that stretch
    // is most of what separates a piano or a clavinet from a synthetic comb.
    //
    // The filter is Rauhala and Valimaki's tunable dispersion filter (SPL 13(5),
    // 2006), a second-order Thiran allpass redesigned from `frequency` and `B`
    // every block, so the stiffness tracks the pitch rather than being baked in.
    //
    // **The taper is ours and unsourced**: `B = 1e-5 * 100^stiffness`, an
    // exponential across the two decades of inharmonicity coefficient the paper
    // searched for pianos. No paper in this corpus prescribes a knob mapping.
    // 0 bypasses the cascade exactly - the default path costs nothing - and 1 is
    // deliberately stiffer than any real string.
    //
    // Being an allpass it cannot change any partial's decay time, and the loop
    // gives back exactly the phase delay it takes, so this moves neither the
    // pitch nor the decay: it moves the partials. Which is what makes it a
    // different thing from `stretch` above, and not a substitute for it.
    name: "stiffness",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  // And these two are the second polarization. A real string vibrates in two
  // planes at once and they couple to the bridge differently, which is where
  // beating and the two-stage decay both come from - Jarvelainen and
  // Karjalainen 2002 section 2. `polarization` at 0 is one string and costs
  // exactly what one string cost.
  {
    // How far the second polarization is mistuned, 0 to 10 cents. In *cents*
    // rather than Hz because the mechanism is a difference in the string's
    // effective length between the two planes, and a length difference is a
    // constant relative frequency difference - so the beat rate follows the
    // pitch, as a real string's does: 0.64 Hz at 110 Hz, 2.5 Hz at 440,
    // 10.2 Hz at 1760.
    //
    // The range is **ours and unsourced**, like `stiffness`'s taper. The
    // default sits mid-range so that turning `polarization` up on its own gives
    // the beating the feature exists for; 0 gives a pure two-stage decay with
    // no beating, which is Karjalainen, Valimaki and Tolonen's Fig. 10(b).
    //
    // It does nothing while `polarization` is 0.
    name: "detune",
    defaultValue: 0.5,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // How strong the second polarization is, and therefore how much of each
    // effect there is. It is *one* knob for both on purpose: Jarvelainen and
    // Karjalainen section 6 found that "if the polarization components are made
    // equally strong, the two-stage decay cannot be implemented at all", so a
    // control scheme with independent mix and decay-difference knobs would be
    // offering a setting that does not exist.
    //
    // The value is the second component's amplitude relative to the first, so
    // it *is* the level difference the paper measured thresholds against:
    // `-20*log10(polarization)` dB. Their two findings land at 0.45 ("reduction
    // of level of the vertical component was detected poorly until the level
    // difference was about 7 dB") and 0.126 ("for differences greater than
    // 18 dB beatings remained inaudible").
    //
    // - **0**, the default: one string, and bit-identical to the module without
    //   this feature. No second delay line is even allocated.
    // - **mid**: the characteristic pair - a loud fast "prompt sound" giving way
    //   to a quiet, slow "aftersound", plus beating from `detune`.
    // - **1**: equally strong, maximum beating, and no two-stage decay left.
    //
    // The weak polarization rings three times as long as the strong one, which
    // is not a free parameter here - see `POLARIZATION_TIME_CONSTANT` in
    // `dsp.ts`. So the note outlasts `decay` in dual mode, by about 2x at a
    // useful mix: `decay` is the *prompt* sound's time, which is the component
    // it is applied to.
    name: "polarization",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // Pitch glide from the pluck's own energy. A hard pluck stretches the
    // string, which raises its tension, which raises its pitch - and it all
    // slides back down as the vibration decays. It is the sound of a snapped
    // bass string, a tom-tom, and most ethnic plucked instruments.
    //
    // Avanzini, Marogna and Bank 2012: "the short-time average of the tension
    // variation, which is responsible for pitch glides, is approximately
    // proportional to the system energy". This is that - their section V-B
    // energy storage model, seeded from the burst and decaying with the loop's
    // own dissipation - which makes it a **pitch glide**, not a full
    // tension-modulation model: the nonlinearity also couples harmonic modes
    // (Tolonen et al. 2000 name both effects) and the quasi-static
    // approximation this rests on does not reproduce that.
    //
    // The glide scales with `level^2`, so a soft pluck glides less than a hard
    // one, which is the whole physical point.
    //
    // The taper is **ours and unsourced**, but calibrated against measured
    // numbers: at a full-scale pluck, 1 is a semitone of initial sharpening and
    // 0.5 clears every detection threshold Jarvelainen and Valimaki 2001
    // measured (3.1 / 4.4 / 5.4 / 11.7 Hz at 116.5 / 196 / 349 / 659 Hz), while
    // 0.1 is the recorded electric guitar of their Fig. 1 - about 3 Hz at
    // 499 Hz, right at the threshold.
    //
    // **Default 0**, and deliberately: their own conclusion is that "any pitch
    // glide weaker than the given threshold remains inaudible for most
    // listeners and could be left unimplemented in digital sound synthesis",
    // and at the shipped `level` a physically-scaled glide sits near that
    // threshold. It ships as an effect a patch asks for, and costs nothing
    // until it does.
    name: "tension",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // The other hand. 0 leaves the string ringing for as long as `decay` says;
    // 1 mutes it in 50 milliseconds, which is a hand landing on the strings.
    //
    // It works by **raising the loop's loss**, not by pulling down the output -
    // Laurson et al. 2001 keep the loop-filter coefficients time-varying
    // precisely because "they must be changed, for example, during attenuation
    // or re-plucking of the string". That distinction is audible: muting through
    // the loop is the same mechanism as decaying, so a damped string still loses
    // its high partials first and dies dark, where an output gain would take
    // every frequency down together and sound like a fader.
    //
    // The knob is geometric in the decay time - `decay^(1-damp) * 0.05^damp` -
    // so with `decay` at 1 second the quarter points are 0.47, 0.22 and 0.11 s.
    // It can only shorten: a damper cannot make a string ring longer.
    //
    // With `damp`, a re-pluck that adds to a ringing string, and an a-rate
    // `frequency` that moves without a trigger, the gesture vocabulary of a
    // plucked-string controller is complete: pluck, damp, re-pluck, slide,
    // legato.
    name: "damp",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
];
