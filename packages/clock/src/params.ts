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
  {
    // How much of each beat the gate output is high for. A fraction of the
    // beat rather than a duration: at 120 BPM the default is 250 ms, about 86
    // render quanta, so no consumer can miss it. A fixed short pulse could
    // land inside one 128-frame block and be invisible to a k-rate reader.
    name: "pulseWidth",
    defaultValue: 0.5,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
];
