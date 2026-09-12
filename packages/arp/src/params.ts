import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `X.descriptors`.
//
// Six parameters, one of them a-rate.
// `AudioParamDescriptor.automationRate` defaults to `"a-rate"` in the spec, so
// every `k-rate` below is an explicit opt-out and carries a reason for being
// one. `scripts/_worklet.ts`, next to `ParamDescriptor`, has the two grounds.
export const PARAMS: readonly ParamDescriptor[] = [
  {
    // The step. a-rate so the note changes at the trigger's own sample rather
    // than at the top of the next render quantum, and so two triggers inside
    // one quantum advance the arpeggiator twice - at k-rate the second was
    // invisible. What it emits is still one note per trigger.
    name: "trigger",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
    automationRate: "a-rate",
  },
  {
    // Structural: an index into a bank of traversal functions, matched to
    // `ArpMode`. A per-sample value would mean changing direction 128 times a
    // block, which is not direction modulation - the same grounds `lfo`'s
    // `type` gives for being k-rate.
    //
    // Being a `Param` at all is the interesting part: patch a slow `Lfo` into
    // it and the traversal becomes a sequence, which is an arpeggiator whose
    // own direction is arpeggiated. Nothing in the survey behind this module
    // can do that, because in every one of them the mode is a menu.
    //
    // The two random values are not interchangeable and the names do not say
    // how: `Random` wanders - uniform, but never the note just played - and
    // `RandomOther` covers, playing every note of the set once per pass in a
    // fresh order each pass.
    name: "mode",
    defaultValue: 0, // ArpMode.Up
    minValue: 0,
    maxValue: 5, // Up, Down, UpDownExclusive, UpDownInclusive, Random, RandomOther
    automationRate: "k-rate",
  },
  {
    // Structural, and the same bank-index argument as `mode`: it selects which
    // of two mappings turns a position in the sequence into a note and an
    // octave. `Serial` plays the whole set and then moves up an octave;
    // `Repeat` plays each note in every octave before moving to the next note,
    // which from one chord and one direction is a completely different figure.
    //
    // **Inert when `octaves` is 1**, where both mappings agree - which is the
    // first thing a reader will wonder.
    name: "octaveMode",
    defaultValue: 0, // ArpOctaveMode.Serial - unchanged behaviour
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  // The other three describe the *set of notes* this walks. All three are
  // read once per trigger, and none of them is a signal: a set that changed
  // between two samples of one note is not a set anybody chose.
  {
    // MIDI note number: the root the scale is built on. Transposing between
    // steps is meaningful; transposing *within* a step is not, because the
    // note is already picked.
    name: "baseNote",
    defaultValue: 60,
    minValue: 0,
    maxValue: 127,
    automationRate: "k-rate",
  },
  {
    // Structural: a 12-bit pitch-class mask, decoded to an array of pitch
    // classes when it changes. Interpolating between two masks is meaningless
    // - the value is a set, not a quantity.
    //
    // The default is a minor triad (`ArpScale.TriadMinor`, [0, 3, 7]) and not
    // the root alone, because `Arp(ac, { trigger })` with no other input has to
    // make music: a one-note set is one note repeated forever, which is the
    // same class of defect as `euclid`'s `steps: 0`. It is also the degenerate
    // case the traversal needs a guard for.
    name: "scale",
    defaultValue: 137,
    minValue: 1,
    maxValue: 4095,
    automationRate: "k-rate",
  },
  {
    // How many octaves the sequence spans. A count, and the same argument as
    // `scale`: it is read when a step fires. Floored - a fractional count has
    // no meaning - and the note is folded back under MIDI 127 rather than
    // being allowed past it.
    name: "octaves",
    defaultValue: 1,
    minValue: 1,
    maxValue: 10,
    automationRate: "k-rate",
  },
];
