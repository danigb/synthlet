import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `X.descriptors`.
//
// Six parameters, none of them a-rate.
//
// `AudioParamDescriptor.automationRate` defaults to `"a-rate"` in the spec, so
// every `k-rate` below is an explicit opt-out and carries a reason for being
// one. `scripts/_worklet.ts`, next to `ParamDescriptor`, has the two grounds.
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
  {
    // Region start, in seconds into the buffer. Live: sweeping it while a note
    // sounds moves the read region without rewinding.
    //
    // k-rate because the engine consumes a region change when it starts its
    // next analysis frame - the same reason `playbackRate` is k-rate - so a
    // region edge lands on a block boundary, not on a sample.
    //
    // The range is arbitrary and has to be: an AudioParam's range is fixed at
    // construction and the buffer's length is not known until `setBuffer`.
    // An hour is longer than anything anyone streams through a worklet.
    name: "startOffset",
    defaultValue: 0,
    minValue: 0,
    maxValue: 3600,
    automationRate: "k-rate",
  },
  {
    // Region end, in seconds. **0 means the end of the buffer** - the same
    // sentinel `dsp.ts` already used for `duration`, kept rather than invented,
    // and the only way to say "to the end" when the length is unknown here.
    //
    // k-rate and 3600 for the same reasons as `startOffset`.
    name: "endOffset",
    defaultValue: 0,
    minValue: 0,
    maxValue: 3600,
    automationRate: "k-rate",
  },
  {
    // `> 0` plays the region back to front. Not a negative `playbackRate`: a
    // parameter range cannot be discontinuous, so `[-16, 16]` would have to
    // include 0, and rate 0 means freeze - a different feature with its own
    // semantics. A separate flag keeps `playbackRate` strictly positive.
    //
    // `> 0` rather than `>= 0.5` is the repo-wide gate/trigger rule, and the
    // one that survives `Param`'s input x gain + offset.
    name: "reverse",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // `> 0` wraps at the region edge instead of ending. An ordinary k-rate
    // param, so it is patchable: an envelope into it is a one-shot that
    // becomes a sustain.
    name: "loop",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
];
