import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `X.descriptors`.
export const PARAMS: readonly ParamDescriptor[] = [
  {
    // The time-stretch ratio, pitch-preserving. Deliberately reuses the
    // `AudioBufferSourceNode` name with corrected semantics: there it resamples
    // (and so drags the pitch with it), here the pitch stays put.
    //
    // k-rate, and honestly so: WSOLA consumes a rate change as a per-block step
    // when it starts the next analysis frame, so there is nothing a per-sample
    // value could mean. A ramp is a sequence of small steps.
    name: "playbackRate",
    defaultValue: 1,
    minValue: 0.0625, // 1/16
    maxValue: 16,
    automationRate: "k-rate",
  },
  {
    // Pitch shift in cents, duration-preserving. The range *is* the engine's
    // +/-12 semitone cap: an AudioParam clamps to its descriptor, so there is
    // nothing to refuse at runtime.
    //
    // k-rate for the same reason as `playbackRate`: the pitch ratio sets the
    // engine's internal rate, which is a per-block quantity.
    name: "detune",
    defaultValue: 0,
    minValue: -1200,
    maxValue: 1200,
    automationRate: "k-rate",
  },
];
