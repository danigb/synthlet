import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `X.descriptors`.
export const PARAMS: readonly ParamDescriptor[] = [
  {
    name: "trigger",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    name: "frequency",
    defaultValue: 440,
    minValue: 20,
    maxValue: 20000,
    automationRate: "k-rate",
  },
  {
    // Seconds: the time the string takes to fall 60 dB, at every pitch. It
    // used to be a count of periods, so the same knob position rang for 3.2 s
    // at 110 Hz and 0.22 s at 1760 Hz.
    name: "decay",
    defaultValue: 1,
    minValue: 0.01,
    maxValue: 5,
    automationRate: "k-rate",
  },
  {
    // How fast the high partials die relative to the low ones - the tilt of
    // the loop filter, not its overall loss. 1 is the brightest the loop can
    // be (the damping filter degenerates to a plain delay and only `decay`
    // remains); 0 is the maximum damping a three-tap symmetric FIR can apply,
    // a zero at Nyquist.
    name: "brightness",
    defaultValue: 0.5,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
];
