import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `X.descriptors`.
export const PARAMS: readonly ParamDescriptor[] = [
  {
    // The note. a-rate because an envelope's whole job is to start and stop at
    // a moment, and at k-rate that moment is rounded to the top of the next
    // render quantum - up to 2.9 ms late at 44.1 kHz, and by a different amount
    // for every event, so a repeated pattern does not even swing consistently.
    // `dsp.ts` has read this rate-agnostically since the envelopes work; what
    // changes here is that a caller no longer has to know to ask.
    name: "gate",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
    automationRate: "a-rate",
  },
  {
    name: "attack",
    defaultValue: 0.01,
    minValue: 0,
    maxValue: 10,
    automationRate: "k-rate",
  },
  {
    name: "decay",
    defaultValue: 0.1,
    minValue: 0,
    maxValue: 10,
    automationRate: "k-rate",
  },
  {
    name: "sustain",
    defaultValue: 0.5,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    name: "release",
    defaultValue: 0.3,
    minValue: 0,
    maxValue: 10,
    automationRate: "k-rate",
  },
  {
    name: "offset",
    defaultValue: 0,
    minValue: -20000,
    maxValue: 20000,
    automationRate: "k-rate",
  },
  {
    name: "gain",
    defaultValue: 1,
    minValue: -20000,
    maxValue: 20000,
    automationRate: "k-rate",
  },
];
