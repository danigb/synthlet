import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `X.descriptors`.
export const PARAMS: readonly ParamDescriptor[] = [
  {
    name: "delay",
    defaultValue: 0.2,
    minValue: 0.001,
    maxValue: 1.45,
    automationRate: "k-rate",
  },
  {
    name: "damping",
    defaultValue: 0.3,
    minValue: 0,
    maxValue: 0.99,
    automationRate: "k-rate",
  },
  {
    name: "size",
    defaultValue: 1,
    minValue: 0.1,
    maxValue: 3,
    automationRate: "k-rate",
  },
  {
    name: "diffusion",
    defaultValue: 0.5,
    minValue: 0,
    maxValue: 0.99,
    automationRate: "k-rate",
  },
  {
    name: "feedback",
    defaultValue: 0.9,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    name: "modDepth",
    defaultValue: 0.1,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    name: "modFreq",
    defaultValue: 2,
    minValue: 0,
    maxValue: 10,
    automationRate: "k-rate",
  },
];
