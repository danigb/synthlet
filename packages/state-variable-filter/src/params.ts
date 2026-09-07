import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `X.descriptors`.
//
// Three parameters, one of them a-rate.
//
// `AudioParamDescriptor.automationRate` defaults to `"a-rate"` in the spec, so
// every `k-rate` below is an explicit opt-out and carries a reason for being
// one. `scripts/_worklet.ts`, next to `ParamDescriptor`, has the two grounds.
export const PARAMS: readonly ParamDescriptor[] = [
  {
    // Structural: an index into `SvfType`, and each type is a different set of
    // output mixing coefficients rather than a point on a continuum. Crossing
    // from a lowpass to a highpass mid-block is a discontinuity, not a sweep.
    name: "type",
    defaultValue: 1,
    minValue: 0,
    maxValue: 6,
    automationRate: "k-rate",
  },
  {
    // Cutoff, in Hz, and the reason this package is the origin of the house
    // a-rate read idiom. Filter cutoff is *the* modulation target in
    // subtractive synthesis: `MonoSynth` sweeps it from an `AdsrEnv`, and at
    // k-rate that sweep is a 344 Hz staircase. `dsp.ts` recomputes the
    // coefficients per sample when this is automated and once per block when
    // it is not.
    name: "frequency",
    defaultValue: 1000,
    minValue: 20,
    maxValue: 20000,
    automationRate: "a-rate",
  },
  {
    // Resonance, and the other half of a filter's performance surface. It opens
    // with the envelope, it tracks velocity, and a slow LFO on it is a standard
    // sound - the same argument `virtual-analog-filter` made for `resonance` in
    // automation-rate ticket 04, resolved the same way, so the library's two
    // filters now agree.
    //
    // This used to be k-rate, with a comment that called itself "a bet, and a
    // weak one" and named the obstacle as shape rather than cost. It was right
    // about the cost: threading `Q` per sample measures at +4.6%, because
    // `dsp.ts` already computed `k = 1/max(q, 1e-4)` on every call and reading
    // a different `q` each time adds an array index, not a division. An
    // unmodulated filter pays nothing at all - Chrome delivers length 1 for a
    // constant, and `dsp.ts` takes the same branch it always did.
    //
    // The default is Butterworth. 0.5 - what it was - measures as a -0.09 dB
    // peak: over-damped, with no -3 dB point at the cutoff at all. It is not
    // Butterworth, it is not `BiquadFilterNode`'s default of 1, and it is not a
    // decision recorded anywhere in this repository's history: nobody chose it.
    // 0.7071 measures as exactly 0.000 dB with -3 dB at the cutoff, which is
    // what someone arriving from `BiquadFilterNode` means by "no resonance".
    name: "Q",
    defaultValue: 0.7071,
    minValue: 0.025,
    maxValue: 40,
    automationRate: "a-rate",
  },
];
