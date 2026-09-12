import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `SampleHold.descriptors`.
//
// `AudioParamDescriptor.automationRate` defaults to `"a-rate"` in the spec, so
// a `k-rate` below is an explicit opt-out and carries a reason for being one.
// `scripts/_worklet.ts`, next to `ParamDescriptor`, has the two grounds.
export const PARAMS: readonly ParamDescriptor[] = [
  {
    // Structural: two latches wired to opposite edges, not two ends of a
    // range. Crossfading between them would mean crossfading between "the
    // value at the last rising edge" and "the input", which is not a value.
    name: "type",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // The clock. An **event** parameter, and the library declares those
    // a-rate: a trigger quantised to the render quantum is up to 2.9 ms late
    // at 44.1 kHz, and on this module that is not a late sample, it is a
    // *different* sample. Fed white noise, the quantisation decides which
    // random value you get.
    //
    // Read with the hoisted `length > 1` idiom, so a caller who leaves it
    // k-rate - or connects a constant - still works.
    name: "trigger",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
    automationRate: "a-rate",
  },
];
