import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `X.descriptors`.
export const PARAMS: readonly ParamDescriptor[] = [
  // In Hz, and it means it: the increment is derived from the context sample rate
  // and the loaded table's length inside the worklet, so no table length or sample
  // rate changes the pitch. There is deliberately no `baseFrequency` divisor.
  //
  // a-rate, because `AudioParam` sums its inputs with the intrinsic value, so a
  // node connected here is linear FM by construction — and at k-rate that FM is
  // quantised to one step per render quantum, 2.9 ms at 44.1 kHz, which aliases
  // for any modulator above about 172 Hz.
  //
  // **Bipolar**, because the range's lower end is where a modulator is otherwise
  // half-wave rectified, and a rectified modulator is a *different* modulator:
  // the spectrum comes out wrong rather than tame. A negative frequency runs the
  // read pointer backwards, which in a wavetable costs one sign — the sibling
  // package needed its whole discontinuity scheduler rewritten for the same
  // feature.
  {
    name: "frequency",
    defaultValue: 440,
    minValue: -20000,
    maxValue: 20000,
    automationRate: "a-rate",
  },
  // In cents: ±1 octave, and a multiply on the increment. a-rate for the same
  // reason `frequency` is — the two are one expression — and here because it is
  // the cheap way to shape a stack: three instances, three detune values, a
  // `Gain` and `phase: "random"` are a supersaw, which is why this package has
  // no unison of its own.
  {
    name: "detune",
    defaultValue: 0,
    minValue: -1200,
    maxValue: 1200,
    automationRate: "a-rate",
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
