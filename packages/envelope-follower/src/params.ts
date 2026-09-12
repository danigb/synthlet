import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as
// `EnvelopeFollower.descriptors`.
//
// `AudioParamDescriptor.automationRate` defaults to `"a-rate"` in the spec, so
// every `k-rate` below is an explicit opt-out and carries a reason for being
// one. `scripts/_worklet.ts`, next to `ParamDescriptor`, has the two grounds.
export const PARAMS: readonly ParamDescriptor[] = [
  {
    // Structural: two detectors, not two ends of a range. `Rms` carries a
    // second filter that `Peak` does not have.
    name: "type",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // Part 15's Input Gain Control, applied to the **input**, before the
    // detector - which is where the book puts it. For both detectors shipping
    // here that is arithmetically the same as scaling the output; it stops
    // being the same the moment a non-homogeneous detector (a dB output) is
    // added, and the book's placement is the one to keep.
    name: "gain",
    defaultValue: 1,
    minValue: 0,
    maxValue: 100,
    automationRate: "k-rate",
  },
  {
    // Seconds to cover 99 % of a rise. The engine turns it into a filter
    // coefficient once per block and caches it across blocks: recomputing an
    // `exp` per sample is what a per-sample read would cost, for a parameter
    // whose whole job is to be slow.
    name: "attack",
    defaultValue: 0.01,
    minValue: 0,
    maxValue: 10,
    automationRate: "k-rate",
  },
  {
    // Seconds to cover 99 % of a fall. Not smaller by default: a rectified
    // signal ripples at twice its frequency, so at 50 Hz the ripple period is
    // 10 ms and any release much under that produces a follower that wobbles.
    name: "release",
    defaultValue: 0.1,
    minValue: 0,
    maxValue: 10,
    automationRate: "k-rate",
  },
];
