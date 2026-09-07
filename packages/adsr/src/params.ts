import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `X.descriptors`.
//
// Seven parameters, one of them a-rate.
// `AudioParamDescriptor.automationRate` defaults to `"a-rate"` in the spec, so
// every `k-rate` below is an explicit opt-out and carries a reason for being
// one. `scripts/_worklet.ts`, next to `ParamDescriptor`, has the two grounds.
export const PARAMS: readonly ParamDescriptor[] = [
  {
    // The note. a-rate because an envelope's whole job is to start and stop at
    // a moment, and at k-rate that moment is rounded to the top of the next
    // render quantum - up to 2.9 ms late at 44.1 kHz, and by a different amount
    // for every event, so a repeated pattern does not even swing consistently.
    // `dsp.ts` has read this rate-agnostically since the envelopes work; what
    // changes here is that a caller no longer has to know to ask.
    name: "gate",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
    automationRate: "a-rate",
  },
  // The four below are the envelope's shape. Each is a *duration* or a level
  // that a duration runs to, consumed as one exponential coefficient per
  // segment: a value that changed 44100 times a second would not be a duration
  // at all. k-rate is what they mean, not a saving - and `_updateAdsr` runs
  // every block, so a knob still tracks a sweep at the rate a knob moves.
  {
    // Seconds from 0 to 1.
    name: "attack",
    defaultValue: 0.01,
    minValue: 0,
    maxValue: 10,
    automationRate: "k-rate",
  },
  {
    // Seconds from 1 down to `sustain`.
    name: "decay",
    defaultValue: 0.1,
    minValue: 0,
    maxValue: 10,
    automationRate: "k-rate",
  },
  {
    // The level held while the gate is open - a level rather than a time, but
    // the same kind of thing: what the decay segment is aiming at.
    name: "sustain",
    defaultValue: 0.5,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // Seconds from wherever the gate closed down to 0.
    name: "release",
    defaultValue: 0.3,
    minValue: 0,
    maxValue: 10,
    automationRate: "k-rate",
  },
  // And these two map the envelope onto whatever it drives: `offset + env *
  // gain`. Both are read once per block.
  {
    // Where the envelope sits when it is closed - the bottom of a filter
    // sweep, say. **A bet**, and the weakest kind: adding a signal here is
    // exactly what the destination `AudioParam`'s own summing already does, so
    // a caller who wants it has a better route than this parameter.
    name: "offset",
    defaultValue: 0,
    minValue: -20000,
    maxValue: 20000,
    automationRate: "k-rate",
  },
  {
    // How far the envelope travels. **A bet, not a fact**: a signal on
    // `gain` is a VCA and would be perfectly meaningful per sample. It stays
    // k-rate because the native `GainNode` already is that, with an a-rate
    // `gain`, and because `AdsrAmp` - the modulator mode - is the shape a
    // caller reaches for instead. Revisit with a patch that wants otherwise.
    name: "gain",
    defaultValue: 1,
    minValue: -20000,
    maxValue: 20000,
    automationRate: "k-rate",
  },
];
