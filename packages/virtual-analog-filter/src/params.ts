import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `X.descriptors`.
//
// Four parameters, three of them a-rate.
// `AudioParamDescriptor.automationRate` defaults to `"a-rate"` in the spec, so
// the one `k-rate` below is an explicit opt-out and says why it is one.
export const PARAMS: readonly ParamDescriptor[] = [
  {
    // Structural: an index into a bank of nine filter models, each of which is
    // a different circuit with its own state. Moving it mid-block is a
    // discontinuity rather than a feature, and the value is set once.
    name: "type",
    defaultValue: 0,
    minValue: 0,
    maxValue: 8,
    automationRate: "k-rate",
  },
  {
    // Filter cutoff is the canonical modulation target in subtractive
    // synthesis: an envelope on it *is* the sound. `state-variable-filter`,
    // the other filter in this library, has declared this a-rate from the
    // start, so `MonoSynth` gets a smooth sweep through `Svf` and got a 344 Hz
    // staircase through this one. There was no stated reason for the
    // difference and there is no cost one either - the modulator renders
    // whether or not the samples are read.
    name: "frequency",
    defaultValue: 1000,
    minValue: 20,
    maxValue: 20000,
    automationRate: "a-rate",
  },
  {
    // Semitones on top of `frequency`, and part of the same quantity: a
    // modulator on either one moves the cutoff, so they have to agree about
    // rate or the pair is only as smooth as its coarser half.
    name: "detune",
    defaultValue: 0,
    minValue: -127,
    maxValue: 127,
    automationRate: "a-rate",
  },
  {
    // The other half of a filter's performance surface, and modulated for the
    // same reasons: it opens with the envelope, it tracks velocity, and a slow
    // LFO on it is a standard sound.
    name: "resonance",
    defaultValue: 0.8,
    minValue: 0,
    maxValue: 1,
    automationRate: "a-rate",
  },
];
