import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `X.descriptors`.
export const PARAMS: readonly ParamDescriptor[] = [
  {
    name: "delay",
    defaultValue: 0.5,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    name: "rate",
    defaultValue: 0.5,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    name: "depth",
    defaultValue: 0.5,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    name: "deviation",
    defaultValue: 0.5,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
];
