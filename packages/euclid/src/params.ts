import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `X.descriptors`.
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
    name: "steps",
    defaultValue: 0,
    minValue: 0,
    maxValue: 100,
    automationRate: "k-rate",
  },
  {
    name: "beats",
    defaultValue: 0,
    minValue: 0,
    maxValue: 100,
    automationRate: "k-rate",
  },
  {
    name: "subdivision",
    defaultValue: 1,
    minValue: 1,
    maxValue: 20,
    automationRate: "k-rate",
  },
  {
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
    name: "pulseWidth",
    defaultValue: 0.5,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
];
