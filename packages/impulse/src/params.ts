import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `X.descriptors`.
export const PARAMS: readonly ParamDescriptor[] = [
  {
    // a-rate so the *detection* stops being quantised. At k-rate the processor
    // read one sample per block, so a pulse that rose and fell inside a render
    // quantum was never seen at all - not late, gone. Reading every sample also
    // means a trigger arriving mid-block is seen in that block rather than the
    // next one.
    //
    // Where the impulse is *written* is a separate question, deferred: it still
    // goes at index 0. See `worklet.ts`.
    name: "trigger",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
    automationRate: "a-rate",
  },
];
