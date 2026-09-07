import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `X.descriptors`.
//
// Seven parameters, two of them a-rate. `AudioParamDescriptor.automationRate`
// defaults to `"a-rate"` in the spec, so every `k-rate` below is an explicit
// opt-out and carries a reason for being one.
//
// The split is signal against coefficient. `input` and `mod` are what `Param`
// carries; the other five describe what it does to them, are set once at
// construction in every factory in `index.ts`, and are read once per block.
export const PARAMS: readonly ParamDescriptor[] = [
  {
    // Structural: an index into a bank of converter functions, not a signal.
    // The processor caches the converter and swaps it when this changes, so a
    // per-sample value would mean changing function 128 times a block.
    name: "scale",
    defaultValue: 0,
    minValue: 0,
    maxValue: 3,
    automationRate: "k-rate",
  },
  {
    // The signal. `Param` exists to make numbers and nodes interchangeable at
    // every parameter, and at k-rate anything patched in here - an LFO, a gate,
    // an envelope, an oscillator - is decimated to one value per render
    // quantum. Every drum voice's trigger inlet and `MonoSynth`'s gate is one
    // of these, so this is where note timing was being quantised.
    name: "input",
    defaultValue: 0,
    minValue: -20000,
    maxValue: 20000,
    automationRate: "a-rate",
  },
  {
    // Coefficient: added after the conversion and the gain, once per block.
    name: "offset",
    defaultValue: 0,
    minValue: -20000,
    maxValue: 20000,
    automationRate: "k-rate",
  },
  {
    // Coefficient: the bottom of `ParamScaleType.Linear`'s range, and ignored
    // by the other three converters. Set once, by `Param.lin`.
    name: "min",
    defaultValue: 0,
    minValue: -20000,
    maxValue: 20000,
    automationRate: "k-rate",
  },
  {
    // Coefficient: the top of the same range, under the same reasoning.
    name: "max",
    defaultValue: 1,
    minValue: -20000,
    maxValue: 20000,
    automationRate: "k-rate",
  },
  {
    // Coefficient. The VCA-shaped use of `Param` - a signal on `input` and an
    // envelope on `gain` - is what the native `GainNode` already is, with an
    // a-rate `gain`, so that patch has a better answer than this parameter.
    // Sweeping it produces block steps by design.
    name: "gain",
    defaultValue: 1,
    minValue: -20000,
    maxValue: 20000,
    automationRate: "k-rate",
  },
  {
    // The second signal, summed with `input` before conversion: the modulation
    // inlet, and the vision document's own example is `{ input: 1, mod: lfo }`.
    // A modulator is a node by construction, so k-rate here bought nothing -
    // it rendered the modulator and threw the samples away.
    name: "mod",
    defaultValue: 0,
    minValue: -20000,
    maxValue: 20000,
    automationRate: "a-rate",
  },
];
