import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `X.descriptors`.
export const PARAMS: readonly ParamDescriptor[] = [
  {
    name: "type",
    defaultValue: 1,
    minValue: 0,
    maxValue: 10,
    automationRate: "k-rate",
  },
  {
    name: "frequency",
    defaultValue: 10,
    minValue: 0,
    maxValue: 200,
    automationRate: "k-rate",
  },
  {
    name: "gain",
    defaultValue: 1,
    minValue: 0,
    maxValue: 10000,
    automationRate: "k-rate",
  },
  {
    name: "offset",
    defaultValue: 0,
    minValue: -1000,
    maxValue: 1000,
    automationRate: "k-rate",
  },
];
