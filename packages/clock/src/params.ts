import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `X.descriptors`.
export const PARAMS: readonly ParamDescriptor[] = [
  {
    name: "bpm",
    defaultValue: 120,
    minValue: 0,
    maxValue: 1000,
    automationRate: "k-rate",
  },
];
