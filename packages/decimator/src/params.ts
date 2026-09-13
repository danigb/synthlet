import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `Decimator.descriptors`.
//
// Four parameters, none of them a-rate.
//
// `AudioParamDescriptor.automationRate` defaults to `"a-rate"` in the spec, so
// every `k-rate` below is an explicit opt-out and carries a reason for being
// one. `scripts/_worklet.ts`, next to `ParamDescriptor`, has the two grounds.
export const PARAMS: readonly ParamDescriptor[] = [
  {
    // The new sample rate, in hertz. **Consumed per block**: the engine turns
    // it into a phase increment and into eight biquads' coefficients, and the
    // coefficients are the expensive half - eight `sin`, eight `cos` and forty
    // divisions. An LFO on the sample rate is a classic effect and worth
    // having, but a-rate here means that recompute per sample with the filters
    // on. Revisit with the filters documented as block-rate if someone asks.
    //
    // The default is 44100 rather than the context's rate because a descriptor
    // cannot read the context. The processor clamps to `sampleRate`, so the
    // default is a bypass at 44.1 kHz and a 44.1 kHz hold at 48 kHz.
    name: "rate",
    defaultValue: 44100,
    minValue: 100,
    maxValue: 192000,
    automationRate: "k-rate",
  },
  {
    // Bit depth, continuous rather than integral: a fractional value is a
    // fractional number of levels, so a slider from 24 down to 2 is a smooth
    // crush rather than 22 steps. 24 short-circuits the quantiser, which is
    // what makes the default an exact wire.
    //
    // k-rate on the same ground as `rate`: the level count is computed once
    // per block. Unlike `rate` it would be cheap per sample - one `pow` - but
    // the two belong together, and a module whose sample rate is block-rate
    // and whose bit depth is not would be a surprising surface.
    name: "bits",
    defaultValue: 24,
    minValue: 1,
    maxValue: 24,
    automationRate: "k-rate",
  },
  {
    // Structural: a filter is in the path or it is not. There is no meaning to
    // half an anti-alias filter - the parameter selects a topology, not a
    // depth, and crossfading to a lowpass at 0.45 x rate is what a `Gain` pair
    // around the module already does.
    //
    // **Off by default.** The module's own sound - aliasing - is what Part 17
    // is about and what you should hear first, the same reasoning `granite`
    // used for `wet: 1`.
    name: "antialias",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // Same filter, same switch, other side of the quantiser. Separate from
    // `antialias` because the two illustrate different claims: one is "you
    // have to filter before", the other is "the samples are not the sound".
    name: "reconstruct",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
];
