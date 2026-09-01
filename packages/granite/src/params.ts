import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `X.descriptors`.
export const PARAMS: readonly ParamDescriptor[] = [
  {
    name: "wet",
    defaultValue: 0.5,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    name: "speed",
    defaultValue: 10,
    minValue: 0,
    maxValue: 100,
    automationRate: "k-rate",
  },
  {
    name: "density",
    defaultValue: 15,
    minValue: 0,
    maxValue: 30,
    automationRate: "k-rate",
  },
  {
    name: "spread",
    defaultValue: 0.5,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
];
