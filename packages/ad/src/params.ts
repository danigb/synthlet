import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `X.descriptors`.
//
// Five parameters, one of them a-rate.
// `AudioParamDescriptor.automationRate` defaults to `"a-rate"` in the spec, so
// every `k-rate` below is an explicit opt-out and carries a reason for being
// one. `scripts/_worklet.ts`, next to `ParamDescriptor`, has the two grounds.
export const PARAMS: readonly ParamDescriptor[] = [
  {
    // The note. a-rate for the same reason as `adsr`'s gate: the sample a
    // percussive envelope fires on is the thing it is for, and k-rate rounded
    // it to the top of a render quantum. The read in `worklet.ts` already
    // handles both shapes.
    name: "trigger",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
    automationRate: "a-rate",
  },
  // The envelope's shape: two durations, each consumed as one exponential
  // coefficient per segment. A duration that changed every sample would not be
  // a duration. k-rate is what they mean rather than a saving.
  {
    // Seconds from 0 to 1.
    name: "attack",
    defaultValue: 0.01,
    minValue: 0,
    maxValue: 10,
    automationRate: "k-rate",
  },
  {
    // Seconds from 1 back down to silence.
    name: "decay",
    defaultValue: 0.1,
    minValue: 0,
    maxValue: 10,
    automationRate: "k-rate",
  },
  // And the two that map it onto whatever it drives: `offset + env * gain`.
  {
    // Where the envelope sits at rest. **A bet**, and the weakest kind:
    // adding a signal here is exactly what the destination `AudioParam`'s own
    // summing already does.
    name: "offset",
    defaultValue: 0,
    minValue: -20000,
    maxValue: 20000,
    automationRate: "k-rate",
  },
  {
    // How far it travels. **A bet, not a fact**, exactly as in `adsr`: a
    // signal here would be a VCA and is perfectly meaningful per sample. The
    // native `GainNode` and this package's own `AdAmp` modulator mode are the
    // answers to that patch.
    name: "gain",
    defaultValue: 1,
    minValue: -20000,
    maxValue: 20000,
    automationRate: "k-rate",
  },
];
