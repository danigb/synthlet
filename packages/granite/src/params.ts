import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `X.descriptors`.
//
// Four parameters, none of them a-rate. Every one of them is consumed when a
// *grain* is scheduled, not when a sample is written: the engine reads them
// once per block into its scheduler, and a grain that is already sounding
// keeps the values it was born with. That is ground (b) for all four - a
// per-sample value has nothing to act on between grains.
//
// `AudioParamDescriptor.automationRate` defaults to `"a-rate"` in the spec, so
// every `k-rate` below is an explicit opt-out and carries a reason for being
// one. `scripts/_worklet.ts`, next to `ParamDescriptor`, has the two grounds.
export const PARAMS: readonly ParamDescriptor[] = [
  {
    // Dry/wet mix. **A bet, and the one in this file**: a plain crossfade per
    // sample at the output, so an envelope on it would be meaningful and
    // cheap. It is k-rate only because it sits in the same list as the three
    // grain parameters, which is not a reason. Nearest candidate in this file.
    name: "wet",
    defaultValue: 0.5,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // How fast the read head travels through the buffer, in grains' worth of
    // displacement. Read when the next grain is placed.
    name: "speed",
    defaultValue: 10,
    minValue: 0,
    maxValue: 100,
    automationRate: "k-rate",
  },
  {
    // Grains per second. A *rate of events*, so it is consumed by the
    // scheduler between grains and there is nothing a per-sample value could
    // mean inside one.
    name: "density",
    defaultValue: 15,
    minValue: 0,
    maxValue: 30,
    automationRate: "k-rate",
  },
  {
    // How far each grain's start position is scattered from the read head.
    // Drawn once per grain, so this is read once per grain too.
    name: "spread",
    defaultValue: 0.5,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
];
