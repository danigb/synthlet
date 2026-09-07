import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `X.descriptors`.
//
// `AudioParamDescriptor.automationRate` defaults to `"a-rate"` in the spec, so
// every `k-rate` below is an explicit opt-out and carries a reason for being
// one. `scripts/_worklet.ts`, next to `ParamDescriptor`, has the two grounds.
export const PARAMS: readonly ParamDescriptor[] = [
  {
    // Structural: an index into a table of three voicings, each a different
    // voice count on different base delays through a different output matrix.
    // Moving it mid-block is a topology change rather than a feature, which is
    // the first of the two grounds and the `virtual-analog-filter.type`
    // precedent.
    name: "mode",
    defaultValue: 0,
    minValue: 0,
    maxValue: 2,
    automationRate: "k-rate",
  },
  {
    // LFO rate in hertz. Consumed once per block and ramped per sample inside
    // `compute()`, which is the second of the two grounds.
    name: "rate",
    defaultValue: 0.5,
    minValue: 0,
    maxValue: 7,
    automationRate: "k-rate",
  },
  {
    // Excursion, as a fraction of what this rate can carry. Same ground.
    name: "depth",
    defaultValue: 0.5,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // Dry/wet. Same ground.
    name: "mix",
    defaultValue: 0.5,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // Stereo field control on the wet path. Same ground.
    name: "width",
    defaultValue: 1,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
];
