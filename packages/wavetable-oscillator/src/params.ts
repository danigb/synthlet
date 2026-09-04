import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `X.descriptors`.
export const PARAMS: readonly ParamDescriptor[] = [
  // In Hz, and it means it: the increment is derived from the context sample rate
  // and the loaded table's length inside the worklet, so no table length or sample
  // rate changes the pitch. There is deliberately no `baseFrequency` divisor.
  {
    name: "frequency",
    defaultValue: 440,
    minValue: 0,
    maxValue: 20000,
    automationRate: "k-rate",
  },
  {
    name: "morphFrequency",
    defaultValue: 0.05,
    minValue: 0,
    maxValue: 10,
    automationRate: "k-rate",
  },
];
