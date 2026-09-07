import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `X.descriptors`.
export const PARAMS: readonly ParamDescriptor[] = [
  {
    // The step. a-rate so the note changes at the trigger's own sample rather
    // than at the top of the next render quantum, and so two triggers inside
    // one quantum advance the arpeggiator twice - at k-rate the second was
    // invisible. What it emits is still one note per trigger.
    name: "trigger",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
    automationRate: "a-rate",
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
