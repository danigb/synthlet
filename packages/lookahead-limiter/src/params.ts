import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `X.descriptors`.
//
// Three parameters, two of them a-rate.
//
// `AudioParamDescriptor.automationRate` defaults to `"a-rate"` in the spec, so
// every `k-rate` below is an explicit opt-out and carries a reason for being
// one. `scripts/_worklet.ts`, next to `ParamDescriptor`, has the two grounds.
export const PARAMS: readonly ParamDescriptor[] = [
  {
    // The true-peak ceiling, in dBTP. a-rate: automating it is safe, though a
    // downward move takes `lookahead` samples to reach the smoothed gain. The
    // backstop reads the current value, so the hard bound holds instantly.
    name: "threshold",
    defaultValue: -1,
    minValue: -24,
    maxValue: 0,
    automationRate: "a-rate",
  },
  {
    // Milliseconds for 10-90% recovery (not a time constant). k-rate only
    // because nobody automates a limiter's release at audio rate - the proof
    // survives any per-sample coefficient in [0, 1).
    name: "release",
    defaultValue: 168,
    minValue: 10,
    maxValue: 1000,
    automationRate: "k-rate",
  },
  {
    // Input drive in dB, applied *before* the detector and the delay line.
    // Never a makeup gain: multiplying after the ceiling is enforced would
    // break the guarantee outright.
    name: "gain",
    defaultValue: 0,
    minValue: -12,
    maxValue: 24,
    automationRate: "a-rate",
  },
];
