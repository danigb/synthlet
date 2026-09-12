import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `X.descriptors`.
//
// **The five below replace four that all meant something else.** Faust
// declared its sliders in one order and mapped `ParamIndex` to them in
// another; the hand-written port assigned them in declaration order. Measured,
// `delay` was the dry/wet mix, `rate` was the base delay time, `depth` was the
// per-voice offset and `deviation` was the LFO rate in hertz - truncated on
// the way in to a seventh of the 0.01 ... 7 Hz the Faust source declared.
//
// The file that stood here defended all four being normalised `0..1` knob
// positions because "this is a pedal, not a modular utility". That is a
// reasonable position for a control with no natural unit. It is not one for a
// delay time, which is milliseconds, or an LFO rate, which is hertz - and it
// was arguing for a convention Faust happened to expose rather than one
// anybody picked. The rule here instead: **physical where a unit exists,
// normalised where the useful range is a function of another parameter.**
//
// `rate` is hertz. `depth` is not milliseconds, and that is the one place the
// old argument holds: the useful excursion depends on `rate` - Martens & Marui
// (2006) give the upper bound as `4800*(1/rate) - 350 us` - and on the
// voicing, so a millisecond value would be a number the user has to solve a
// regression to choose. `0 ... 1` meaning "as deep as this rate and this
// voicing can carry" is the honest unit.
//
// `AudioParamDescriptor.automationRate` defaults to `"a-rate"` in the spec, so
// every `k-rate` below is an explicit opt-out and carries a reason for being
// one. `scripts/_worklet.ts`, next to `ParamDescriptor`, has the two grounds:
// the value is structural, or the engine consumes it once per block. "Nobody
// would modulate it" is explicitly not one of them.
//
// The defaults are `JUNO`'s, because `JUNO` is the default mode and
// `Chorus(ac)` with nothing passed has to be a complete answer. The other two
// voicings carry their own, exported as `CHORUS_MODE_DEFAULTS` - an AudioParam
// has one `defaultValue` and cannot ask a table for it, so selecting a mode
// and taking its defaults is two lines in a host rather than one in a
// descriptor.
export const PARAMS: readonly ParamDescriptor[] = [
  {
    // `ChorusMode`: 0 JUNO, 1 ENSEMBLE, 2 DIMENSION.
    //
    // Structural, which is the first of the two grounds and the
    // `virtual-analog-filter.type` precedent: a voicing is a voice count on
    // its own base delays through its own output matrix, so moving this
    // mid-block is a topology change rather than a feature. It cross-fades
    // over 5 ms when it does move.
    name: "mode",
    defaultValue: 0,
    minValue: 0,
    maxValue: 2,
    automationRate: "k-rate",
  },
  {
    // LFO rate in **hertz**, 0 to 7. 0 means stopped, and is a legitimate
    // setting - a static comb - rather than a test hook.
    //
    // k-rate on the second ground: the engine consumes it once per block and
    // ramps it per sample inside `compute()`, so there is no 344 Hz staircase
    // on it. Modulating an LFO's rate at audio rate is not a chorus.
    name: "rate",
    defaultValue: 0.5,
    minValue: 0,
    maxValue: 7,
    automationRate: "k-rate",
  },
  {
    // Excursion, 0 to 1, scaled per mode into milliseconds against the smaller
    // of the voicing's own ceiling and Martens & Marui's rate-dependent bound.
    // Deliberately not milliseconds - see the header.
    //
    // k-rate on the second ground, and ramped per sample.
    name: "depth",
    defaultValue: 0.6,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // Dry/wet, 0 to 1. The dry never falls below `1 - 0.3*mix`, so full wet
    // does not suck the centre out.
    //
    // k-rate on the second ground, and ramped per sample.
    name: "mix",
    defaultValue: 0.5,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // Stereo field control on the wet path, 0 (mono) to 1 (as generated).
    //
    // Dattorro's requirement rather than an extra: "it is prudent to place a
    // stereo field control at the output of any chorus algorithm", because
    // quadrature stereo placement is often unwanted in a mix. It touches the
    // wet path only - narrowing the effect should not narrow the source.
    //
    // k-rate on the second ground, and ramped per sample.
    name: "width",
    defaultValue: 1,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
];
