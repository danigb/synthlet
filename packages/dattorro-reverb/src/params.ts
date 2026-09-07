import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `X.descriptors`.
//
// Nine parameters, none of them a-rate, and the largest k-rate surface in the
// library after `karplus-strong`. Every one is a coefficient in Dattorro's
// plate topology, handed to the engine's `update()` once per block: they
// describe the plate, and a plate that changed between two samples is not a
// plate. Ground (b) throughout, with the two exceptions marked below.
//
// `AudioParamDescriptor.automationRate` defaults to `"a-rate"` in the spec, so
// every `k-rate` below is an explicit opt-out and carries a reason for being
// one. `scripts/_worklet.ts`, next to `ParamDescriptor`, has the two grounds.
export const PARAMS: readonly ParamDescriptor[] = [
  {
    // Input bandwidth: the one-pole before the tank. Rolling this off is how
    // the plate stops being fed what it cannot hold.
    name: "filter",
    defaultValue: 0.7,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // Dattorro's four allpass coefficients, in his order. Each is a
    // coefficient inside an allpass in the input chain or the tank; a
    // per-sample value would be modulating the filter's structure rather than
    // driving it, and the tank's own modulation is what moves per sample.
    name: "inputDiffusion1",
    defaultValue: 0.75,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // The second input allpass, same ground.
    name: "inputDiffusion2",
    defaultValue: 0.625,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // The first tank allpass, same ground.
    name: "decayDiffusion1",
    defaultValue: 0.7,
    minValue: 0,
    maxValue: 0.999999,
    automationRate: "k-rate",
  },
  {
    // The second tank allpass, same ground.
    name: "decayDiffusion2",
    defaultValue: 0.5,
    minValue: 0,
    maxValue: 0.999999,
    automationRate: "k-rate",
  },
  {
    // Tank loop gain, and therefore the decay time. **A bet**, and an
    // arguable one: it is inside the feedback path, where a per-sample gain is
    // a modulated resonator rather than a level control. A `Gain` on the wet
    // return is the safe version of the patch that wants it.
    name: "decay",
    defaultValue: 0.5,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // High-frequency loss per trip round the tank. A coefficient in the loop.
    name: "damping",
    defaultValue: 0.25,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // -1 dry, 0 equal, 1 wet. **A bet**: this is a crossfade applied per
    // sample at the output and nothing about the plate would object to moving
    // it per sample. Candidate.
    name: "dryWet",
    defaultValue: 1,
    minValue: -1,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // Decibels of output trim. **A bet**, and the same one: a plain multiply
    // outside the loop. The answer to the patch that wants it is a `Gain`
    // node, which is native and a-rate.
    name: "level",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
];
