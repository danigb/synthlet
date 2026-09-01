import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `X.descriptors`.
export const PARAMS: readonly ParamDescriptor[] = [
  {
    name: "trigger",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    name: "attack",
    defaultValue: 0.01,
    minValue: 0,
    maxValue: 10,
    automationRate: "k-rate",
  },
  {
    name: "decay",
    defaultValue: 0.1,
    minValue: 0,
    maxValue: 10,
    automationRate: "k-rate",
  },
  {
    name: "offset",
    defaultValue: 0,
    minValue: 0,
    maxValue: 20000,
    automationRate: "k-rate",
  },
  {
    name: "gain",
    defaultValue: 1,
    minValue: 0,
    maxValue: 10000,
    automationRate: "k-rate",
  },
];
