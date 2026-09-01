import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `X.descriptors`.
export const PARAMS: readonly ParamDescriptor[] = [
  {
    name: "clock",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
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
];
