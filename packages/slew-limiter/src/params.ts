import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as
// `SlewLimiter.descriptors`.
//
// `AudioParamDescriptor.automationRate` defaults to `"a-rate"` in the spec, so
// every `k-rate` below is an explicit opt-out and carries a reason for being
// one. `scripts/_worklet.ts`, next to `ParamDescriptor`, has the two grounds.
export const PARAMS: readonly ParamDescriptor[] = [
  {
    // Structural: two laws, and they do not blend. Exponential approaches its
    // target and linear arrives at it; a crossfade between the two is not a
    // third slew, it is a crossfade.
    name: "type",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // Upward. **Two units, one parameter**, which is a real wart and a
    // deliberate one: seconds for 99 % of a step in `Exponential`, seconds per
    // unit in `Linear`, because a rate limiter has no notion of a step. The
    // alternative - a second parameter that is inert in the other mode - is
    // worse. The README has both rows.
    //
    // k-rate: the engine turns it into a coefficient once per block and caches
    // it, and recomputing an `exp` per sample for a parameter whose job is to
    // be slow is not a trade worth making.
    name: "rise",
    defaultValue: 0.1,
    minValue: 0,
    maxValue: 10,
    automationRate: "k-rate",
  },
  {
    // Downward, same units. Separate from `rise` so an S&H staircase gets Part
    // 16's shark's tooth; equal to it for a plain glide.
    name: "fall",
    defaultValue: 0.1,
    minValue: 0,
    maxValue: 10,
    automationRate: "k-rate",
  },
];
