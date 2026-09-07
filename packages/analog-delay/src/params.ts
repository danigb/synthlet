import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `AnalogDelay.descriptors`.
//
// The order is `update()`'s argument order, so it is load-bearing.
//
// Seven of the eight are continuous, and the eighth - `mode` - is the one enum
// the package claims is worth its slot: Tape and BBD read the *same* line at
// different tap positions, which is a difference in kind rather than a filter
// preset. There is deliberately no `tone`: bandwidth is derived from `time`
// and `age`, because that is what the hardware does.
//
// Eight parameters, none of them a-rate, and the ground is the same for all
// eight rather than eight copies of one sentence: every one is an argument to
// `update()`, which recomputes the line's read positions, its filter
// coefficients and its wobble depth once per block. The line itself is what
// moves per sample - a delay whose length changed every sample would be a
// pitch shifter, which is the effect this models rather than the control it
// offers. `mix` and `feedback` are the two that would be meaningful per sample
// and are listed as candidates in the automation-rate folder's ticket 06.
//
// `AudioParamDescriptor.automationRate` defaults to `"a-rate"` in the spec, so
// every `k-rate` below is an explicit opt-out and carries a reason for being
// one. `scripts/_worklet.ts`, next to `ParamDescriptor`, has the two grounds.
export const PARAMS: readonly ParamDescriptor[] = [
  {
    // Seconds, record head to first playback head. Narrower than
    // `digital-delay`'s range because the hardware is: an MN3005 tops out at
    // 204.8 ms and an EP-3 at roughly 800 ms, so a range that ran to 2 s would
    // be advertising a machine that never existed.
    name: "time",
    defaultValue: 0.3,
    minValue: 0.02,
    maxValue: 1.5,
    automationRate: "k-rate",
  },
  {
    // The Space Echo's *Intensity*. Above 1 is intentional - self-oscillation
    // is a destination, held bounded by the loop's soft limiter.
    name: "feedback",
    defaultValue: 0.4,
    minValue: 0,
    maxValue: 1.2,
    automationRate: "k-rate",
  },
  {
    // Dry/wet, as a plain crossfade at the output. **A bet, and the weakest in
    // this file**: nothing about the delay line would object to moving it per
    // sample, and an envelope on the mix is an ordinary production move. The
    // reason it is k-rate is that it arrives through the same `update()` call
    // as everything else, which is a shape rather than an argument.
    name: "mix",
    defaultValue: 0.3,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // A level envelope across the mode's fixed tap positions, not a selector:
    // the first tap is always present and the later ones fade in as this
    // rises. Continuous, so it is a CV destination like everything else, and
    // meaningful in both modes - which a 12-position mode switch would not be.
    name: "taps",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // One composite wear control: more wobble, more saturation, less
    // bandwidth, more noise. El Capistan's *Tape Age*.
    name: "age",
    defaultValue: 0.3,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // Wow and flutter depth, scaling on top of whatever `age` implies. Both
    // are kept because a well-maintained machine with an eccentric capstan is
    // a real and desirable combination one composite knob cannot express.
    name: "wobble",
    defaultValue: 0.3,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // L/R time offset as a ratio: two machines, lightly apart. 0 is
    // mono-compatible. There is no `cross` - ping-pong across two tape
    // machines is unphysical, and the slot is better spent on `taps`.
    name: "spread",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // `AnalogDelayMode`: 0 Tape, 1 BBD. Intermediate values crossfade rather
    // than snap, so automating it is a wipe between two machines instead of a
    // click.
    name: "mode",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
];
