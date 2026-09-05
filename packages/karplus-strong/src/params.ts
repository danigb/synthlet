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
];
