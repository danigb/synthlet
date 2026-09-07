import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `X.descriptors`.
//
// Six parameters, one of them a-rate.
//
// `AudioParamDescriptor.automationRate` defaults to `"a-rate"` in the spec, so
// every `k-rate` below is an explicit opt-out and carries a reason for being
// one. `scripts/_worklet.ts`, next to `ParamDescriptor`, has the two grounds.
export const PARAMS: readonly ParamDescriptor[] = [
  {
    // Not a gate: a phase ramp, rising 0 to 1 over each beat, and the step
    // boundary is the wrap. a-rate so that boundary lands on its own sample
    // rather than at the top of the next render quantum - the same quantity as
    // every other event parameter in the library, arrived at differently.
    // A `Clock` is a node by construction, so k-rate here bought nothing: the
    // ramp was rendered either way and 127 of its 128 samples thrown away.
    name: "clock",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
    automationRate: "a-rate",
  },
  {
    // How many steps the cycle has. Structural: the pattern is generated when
    // this changes and cached, so a per-sample value would rebuild the pattern
    // 128 times a block for a sequence that has not advanced.
    name: "steps",
    defaultValue: 0,
    minValue: 0,
    maxValue: 100,
    automationRate: "k-rate",
  },
  {
    // How many of those steps are hits. Structural, and cached alongside
    // `steps` for the same reason - the two are one Euclidean pattern.
    name: "beats",
    defaultValue: 0,
    minValue: 0,
    maxValue: 100,
    automationRate: "k-rate",
  },
  {
    // How many pattern cycles fit in one clock cycle: a multiplier on the
    // incoming phase ramp. It scales the *clock*, and the clock is what
    // carries the timing - so this is a setting and `clock` is the signal.
    name: "subdivision",
    defaultValue: 1,
    minValue: 1,
    maxValue: 20,
    automationRate: "k-rate",
  },
  {
    // How far the pattern is rotated. Structural, cached with `steps` and
    // `beats`: rotating a pattern is choosing a different pattern.
    name: "rotation",
    defaultValue: 0,
    minValue: 0,
    maxValue: 100,
    automationRate: "k-rate",
  },
  {
    // How much of each step a hit is high for, the same beat-fraction shape
    // `Clock`'s pulseWidth has. It is what makes adjacent hits two triggers
    // instead of one held level.
    //
    // k-rate because it describes the *shape of a step*, which the step
    // boundary - carried by `clock` - is what places. Changing it mid-pulse
    // would move a gate's falling edge without moving anything that reads it.
    name: "pulseWidth",
    defaultValue: 0.5,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
];
