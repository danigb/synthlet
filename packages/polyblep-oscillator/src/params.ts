import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `X.descriptors`.
export const PARAMS: readonly ParamDescriptor[] = [
  {
    name: "type",
    defaultValue: 0,
    minValue: 0,
    maxValue: 2,
    automationRate: "k-rate",
  },
  {
    name: "frequency",
    defaultValue: 440,
    minValue: 0,
    maxValue: 20000,
    automationRate: "k-rate",
  },
  {
    name: "detune",
    defaultValue: 0,
    minValue: 0,
    maxValue: 10000,
    automationRate: "k-rate",
  },
];
