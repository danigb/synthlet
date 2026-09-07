import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `DigitalDelay.descriptors`.
//
// The order is `update()`'s argument order, so it is load-bearing.
//
// Every one is continuous and every one is k-rate. There is deliberately no
// enum: an enum is the one kind of parameter the library's fifth principle -
// everything is a signal - can do nothing with, so a module without one is a
// module where every control is a CV destination.
//
// Eight parameters, none of them a-rate, and one ground for all eight: each is
// an argument to `update()`, which recomputes delay lengths, filter
// coefficients and modulation depths once per block. What moves per sample is
// the line's own read position and the internal modulator. `mix` is the one
// that would be meaningful per sample - a plain output crossfade - and it is
// listed as a candidate in the automation-rate folder's ticket 06.
//
// `AudioParamDescriptor.automationRate` defaults to `"a-rate"` in the spec, so
// every `k-rate` below is an explicit opt-out and carries a reason for being
// one. `scripts/_worklet.ts`, next to `ParamDescriptor`, has the two grounds.
export const PARAMS: readonly ParamDescriptor[] = [
  {
    // Seconds. The range spans flanger (0.2 ms) through comb resonance to a
    // long echo; a software knob has no reason to be zoned.
    name: "time",
    defaultValue: 0.25,
    minValue: 0.0002,
    maxValue: 2,
    automationRate: "k-rate",
  },
  {
    // Loop gain. Above 1 is intentional - self-oscillation is a destination,
    // held bounded by the loop's soft limiter.
    name: "feedback",
    defaultValue: 0.4,
    minValue: 0,
    maxValue: 1.2,
    automationRate: "k-rate",
  },
  {
    // Dry/wet, as a plain crossfade at the output. **A bet, and the weakest in
    // this file**: nothing about the delay line would object to moving it per
    // sample, and an envelope on the mix is an ordinary production move. The
    // reason it is k-rate is that it arrives through the same `update()` call
    // as everything else, which is a shape rather than an argument.
    name: "mix",
    defaultValue: 0.3,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // Tilt on the feedback path, not the output: negative darkens each repeat
    // generation over generation, positive thins it. 0 is an exact bypass.
    name: "tone",
    defaultValue: 0,
    minValue: -1,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // Depth of a slow excursion of the read pointer within the current head.
    // Not the same mechanism as automating `time`, which crossfades instead.
    name: "mod",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // L/R time offset as a ratio. 0 is mono-compatible, 1 makes the right
    // line twice the left.
    name: "spread",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // Feedback cross-feed, as a rotation angle. 0 is two independent lines,
    // 1 is full ping-pong, and the decay time is the same at every setting.
    name: "cross",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // Schroeder allpasses in the loop: 0 is discrete repeats, 1 is a wash.
    name: "diffuse",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
];
