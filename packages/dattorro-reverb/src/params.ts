import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `X.descriptors`.
export const PARAMS: readonly ParamDescriptor[] = [
  {
    name: "filter",
    defaultValue: 0.7,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    name: "inputDiffusion1",
    defaultValue: 0.75,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    name: "inputDiffusion2",
    defaultValue: 0.625,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    name: "decayDiffusion1",
    defaultValue: 0.7,
    minValue: 0,
    maxValue: 0.999999,
    automationRate: "k-rate",
  },
  {
    name: "decayDiffusion2",
    defaultValue: 0.5,
    minValue: 0,
    maxValue: 0.999999,
    automationRate: "k-rate",
  },
  {
    name: "decay",
    defaultValue: 0.5,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    name: "damping",
    defaultValue: 0.25,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  // -1 dry, 0 equal, 1 wet
  {
    name: "dryWet",
    defaultValue: 1,
    minValue: -1,
    maxValue: 1,
    automationRate: "k-rate",
  },
  // decibels
  {
    name: "level",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
];
