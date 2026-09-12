import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `RingMod.descriptors`.
//
// `AudioParamDescriptor.automationRate` defaults to `"a-rate"` in the spec, so
// every `k-rate` below is an explicit opt-out and carries a reason for being
// one. `scripts/_worklet.ts`, next to `ParamDescriptor`, has the two grounds.
export const PARAMS: readonly ParamDescriptor[] = [
  {
    // Structural: which multiply is applied. One member today; the diode ring
    // (Parker, DAFx-11) is a different function rather than a further point on
    // a continuum, which is why this is an index and not a blend.
    name: "type",
    defaultValue: 0,
    minValue: 0,
    maxValue: 0,
    automationRate: "k-rate",
  },
  {
    // **The second audio signal.** It is a parameter rather than an input
    // because `connectParams` can only wire parameters - see the README - and
    // it is a-rate because it carries audio: a k-rate modulator would be one
    // value per 128 frames, which is a 344.5 Hz sample rate.
    //
    // The range is +/-10 rather than +/-1 because an a-rate `AudioParam` is
    // clamped to it. A hot modulator should modulate, not square off.
    name: "modulator",
    defaultValue: 0,
    minValue: -10,
    maxValue: 10,
    automationRate: "a-rate",
  },
  {
    // The DC the modulator is deliberately given back after AC coupling, which
    // is the whole AM<->RM continuum: 0 is ring modulation (the carrier
    // vanishes), 1 is amplitude modulation (the carrier stays, at full
    // amplitude, with half-height sidebands). The ARP 2600 had a switch.
    //
    // k-rate: it is read once per block, and a caller who wants to sweep it
    // audibly can put a `Param` in front of it - which is what the site
    // example does with a slider.
    name: "offset",
    defaultValue: 0,
    minValue: -1,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // Structural: the input DC blockers are on or off. 1 is a ring modulator,
    // 0 is the "lesser RM" of Part 11 - a plain VCA, through which any DC on
    // either side leaks the *other* signal.
    name: "coupling",
    defaultValue: 1,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
];
