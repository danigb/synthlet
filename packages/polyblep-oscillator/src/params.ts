import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `X.descriptors`.
export const PARAMS: readonly ParamDescriptor[] = [
  // `PolyblepOscillatorType`, in brightness order. The default stays the
  // sawtooth so the renumbering changes no existing patch's sound.
  {
    name: "type",
    defaultValue: 2,
    minValue: 0,
    maxValue: 3,
    automationRate: "k-rate",
  },
  // `minValue: 0` is a requirement, not a compromise. `connectParams` writes
  // `param.value = 0` for every connected input (`_worklet.ts:73-76`), so a
  // positive minimum makes Chrome clamp that write and log a "value outside
  // nominal range" warning for every oscillator wired to a node, `MonoSynth`
  // included. Zero frequency is defined as hold: the phase freezes and the
  // output holds a finite constant.
  {
    name: "frequency",
    defaultValue: 440,
    minValue: 0,
    maxValue: 20000,
    automationRate: "a-rate",
  },
  // In cents: +/- one octave.
  {
    name: "detune",
    defaultValue: 0,
    minValue: -1200,
    maxValue: 1200,
    automationRate: "a-rate",
  },
  // Pulse width on the square, peak position on the triangle; ignored by the
  // sine and the sawtooth. The DSP clamps it away from 0 and 1 per sample, by
  // `2 * |increment|`, so it cannot reach either end in the output even though
  // the declared range includes them. That is the right trade: the declared
  // range is the one a UI slider should offer, and the DSP is total across it.
  {
    name: "width",
    defaultValue: 0.5,
    minValue: 0,
    maxValue: 1,
    automationRate: "a-rate",
  },
];
