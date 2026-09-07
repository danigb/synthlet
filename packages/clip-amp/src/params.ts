import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `X.descriptors`.
//
// Three parameters, none of them a-rate.
//
// `AudioParamDescriptor.automationRate` defaults to `"a-rate"` in the spec, so
// every `k-rate` below is an explicit opt-out and carries a reason for being
// one. `scripts/_worklet.ts`, next to `ParamDescriptor`, has the two grounds.
export const PARAMS: readonly ParamDescriptor[] = [
  {
    // Structural: which saturating curve is applied, cached on change in
    // `worklet.ts`. Two curves are two functions, not two ends of a range.
    name: "type",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // Drive into the curve, applied per sample. **A bet**: an envelope on
    // `preGain` is a dynamic-distortion patch and would be meaningful per
    // sample. It stays k-rate because a `Gain` node in front of this does the
    // same thing natively and at a-rate, and because moving it here would mean
    // reading two parameters per sample for a module whose whole job is one
    // multiply and one curve. Revisit with a patch that wants it.
    name: "preGain",
    defaultValue: 1,
    minValue: 0,
    maxValue: 10,
    automationRate: "k-rate",
  },
  {
    // Make-up gain after the curve. **A bet**, and weaker than `preGain`'s: a
    // `Gain` node after this is the same thing, so nothing is lost by leaving
    // it as a trim.
    name: "postGain",
    defaultValue: 1,
    minValue: 0,
    maxValue: 10,
    automationRate: "k-rate",
  },
];
