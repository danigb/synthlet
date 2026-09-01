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
  // MIDI note numbers.
  {
    name: "baseNote",
    defaultValue: 60,
    minValue: 0,
    maxValue: 127,
    automationRate: "k-rate",
  },
  {
    name: "scale",
    defaultValue: 1,
    minValue: 1,
    maxValue: 4095,
    automationRate: "k-rate",
  },
  {
    name: "octaves",
    defaultValue: 1,
    minValue: 1,
    maxValue: 10,
    automationRate: "k-rate",
  },
];
