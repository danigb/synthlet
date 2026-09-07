import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `X.descriptors`.
//
// Four parameters, one of them a-rate.
// `AudioParamDescriptor.automationRate` defaults to `"a-rate"` in the spec, so
// every `k-rate` below is an explicit opt-out and carries a reason for being
// one. `scripts/_worklet.ts`, next to `ParamDescriptor`, has the two grounds.
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
  // The other three describe the *set of notes* this picks from. All three are
  // read once per trigger, and none of them is a signal: a set that changed
  // between two samples of one note is not a set anybody chose.
  {
    // MIDI note number: the root the scale is built on. Transposing between
    // steps is meaningful; transposing *within* a step is not, because the
    // note is already picked.
    name: "baseNote",
    defaultValue: 60,
    minValue: 0,
    maxValue: 127,
    automationRate: "k-rate",
  },
  {
    // Structural: a 12-bit pitch-class mask, decoded to an array of pitch
    // classes when it changes. Interpolating between two masks is meaningless
    // - the value is a set, not a quantity.
    name: "scale",
    defaultValue: 1,
    minValue: 1,
    maxValue: 4095,
    automationRate: "k-rate",
  },
  {
    // How many octaves the random pick may span. A count, and the same
    // argument as `scale`: it is read when a step fires.
    name: "octaves",
    defaultValue: 1,
    minValue: 1,
    maxValue: 10,
    automationRate: "k-rate",
  },
];
