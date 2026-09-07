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
    // Resonance. **A bet, and a weak one**: Q opening with an envelope is as
    // ordinary a patch as cutoff sweeping with one, and `virtual-analog-filter`
    // - the other filter here - made its `resonance` a-rate in automation-rate
    // ticket 04 for exactly that reason. The obstacle is not cost but shape:
    // `dsp.ts`'s `update()` takes `q` as a scalar and only `frequency` is
    // threaded through per sample. Worth a ticket, not a comment.
    name: "Q",
    defaultValue: 0.5,
    minValue: 0.025,
    maxValue: 40,
    automationRate: "k-rate",
  },
];
