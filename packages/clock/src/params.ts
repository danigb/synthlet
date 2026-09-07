import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `X.descriptors`.
//
// Two parameters, neither a-rate. `Clock` is a *producer*: what it emits is a
// phase ramp and a gate, and both are written per sample already.
//
// `AudioParamDescriptor.automationRate` defaults to `"a-rate"` in the spec, so
// every `k-rate` below is an explicit opt-out and carries a reason for being
// one. `scripts/_worklet.ts`, next to `ParamDescriptor`, has the two grounds.
export const PARAMS: readonly ParamDescriptor[] = [
  {
    // Tempo. The phase increment is derived from it and cached on change, so
    // this is read once per block; and a tempo that changed every sample is
    // not a tempo, it is frequency modulation of the clock. A caller who wants
    // that has `Lfo` and `Param`.
    name: "bpm",
    defaultValue: 120,
    minValue: 0,
    maxValue: 1000,
    automationRate: "k-rate",
  },
  {
    // How much of each beat the gate output is high for. A fraction of the
    // beat rather than a duration: at 120 BPM the default is 250 ms, about 86
    // render quanta, so no consumer can miss it. A fixed short pulse could
    // land inside one 128-frame block and be invisible to a k-rate reader.
    name: "pulseWidth",
    defaultValue: 0.5,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
];
