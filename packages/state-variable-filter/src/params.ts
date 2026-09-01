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
    defaultValue: 1000,
    minValue: 20,
    maxValue: 20000,
    automationRate: "a-rate",
  },
  {
    name: "Q",
    defaultValue: 0.5,
    minValue: 0.025,
    maxValue: 40,
    automationRate: "k-rate",
  },
];
