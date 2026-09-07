import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `X.descriptors`.
//
// One parameter, k-rate.
//
// `AudioParamDescriptor.automationRate` defaults to `"a-rate"` in the spec, so
// every `k-rate` below is an explicit opt-out and carries a reason for being
// one. `scripts/_worklet.ts`, next to `ParamDescriptor`, has the two grounds.
export const PARAMS: readonly ParamDescriptor[] = [
  {
    // Structural: an index into `NoiseType`, and each type is a different
    // generator with its own state - white is a fresh random per sample, pink
    // and brown are filters with history. Crossing between two of them
    // mid-block splices two unrelated signals rather than interpolating.
    name: "type",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
];
