import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `X.descriptors`.
export const PARAMS: readonly ParamDescriptor[] = [
  // In Hz, and it means it: the increment is derived from the context sample rate
  // and the loaded table's length inside the worklet, so no table length or sample
  // rate changes the pitch. There is deliberately no `baseFrequency` divisor.
  {
    name: "frequency",
    defaultValue: 440,
    minValue: 0,
    maxValue: 20000,
    automationRate: "k-rate",
  },
  // The wavetable position, normalized: 0 is the first plane, 1 the last, and
  // everything between is a crossfade of the two planes either side of it. It is
  // normalized rather than a plane index so that a modulator patched into it
  // does not have to know how many planes the current table has - `setHarmonics`
  // and `loadWavetable` both produce tables with plane counts the caller chose.
  //
  // a-rate because scanning a table at audio rate is one of the format's
  // signature sounds, and a k-rate position quantises it to 2.9 ms steps.
  {
    name: "morph",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
    automationRate: "a-rate",
  },
];
