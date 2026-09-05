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
    // The top is measured, not declared. Above about 5 kHz the loop is under
    // nine samples long, holds four partials and is excited by a burst of
    // five, and the pitch stops being reliable: the worst of 16 plucks lands
    // 2.1 cents out at 5000 Hz, 8.3 at 5500 and 21 at 6000. 5 kHz is the
    // highest round number that holds inside the 5 cent tolerance every time.
    // The old 20000 was 2.2 samples of delay, which is not a string.
    name: "frequency",
    defaultValue: 440,
    minValue: 20,
    maxValue: 5000,
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
