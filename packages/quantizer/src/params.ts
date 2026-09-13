import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `Quantizer.descriptors`.
//
// Five parameters, one of them a-rate.
//
// `AudioParamDescriptor.automationRate` defaults to `"a-rate"` in the spec, so
// every `k-rate` below is an explicit opt-out and carries a reason for being
// one. `scripts/_worklet.ts`, next to `ParamDescriptor`, has the two grounds.
//
// The split is the signal against the scale it is snapped to: `input` is what
// this module carries, and the other four describe the set of notes it may
// land on and which quantity comes out. A set that changed between two samples
// of one note is not a set anybody chose.
export const PARAMS: readonly ParamDescriptor[] = [
  {
    // The signal, and the reason the module reads it per sample. A
    // sample-and-hold's output is stepped already and would survive k-rate,
    // but the two patches Part 16 is actually about would not: a `SlewLimiter`
    // glide that steps at the sample it crosses a boundary is a glissando, and
    // at k-rate it is a glissando quantised to 2.9 ms at 44.1 kHz - which is
    // audible as a smeared step the moment the glide is fast.
    //
    // Declared over the whole MIDI range, which is also what the engine clamps
    // to: a note number outside 0...127 has no frequency anyone can play.
    name: "input",
    defaultValue: 60,
    minValue: 0,
    maxValue: 127,
    automationRate: "a-rate",
  },
  {
    // Structural: a 12-bit pitch-class mask, bit 0 the root, decoded into a
    // table of allowed notes when it changes. Interpolating between two masks
    // is meaningless - the value is a set, not a quantity.
    //
    // Declared exactly as `Arp.scale` is, down to the `minValue: 1` that
    // `connectParams`' `param.value = 0` makes Chrome clamp and warn about.
    // That warning is the price of the two modules taking the *same* number:
    // a `scale` moved - or a node patched - from the arpeggiator to here has
    // to mean the same seven notes, and two ranges that differed by one would
    // be a worse bug than a console line.
    //
    // The default is `Scale.Chromatic` and not a triad, because the
    // no-argument module is the useful one: `Quantizer(ac)` is a
    // note-number-to-hertz converter, and with `hysteresis: 0` it is exactly
    // that and nothing else.
    name: "scale",
    defaultValue: 4095, // Scale.Chromatic
    minValue: 1,
    maxValue: 4095,
    automationRate: "k-rate",
  },
  {
    // The pitch class the mask is relative to, semitones above C. Floored - a
    // root between two pitch classes is not a key - and read on the same
    // grounds as `scale`, which it is half of: the two together are what
    // "allowed" means, and they are rebuilt as a pair.
    name: "root",
    defaultValue: 0,
    minValue: 0,
    maxValue: 11,
    automationRate: "k-rate",
  },
  {
    // Semitones the input must travel *past* a boundary before the note
    // changes: a Schmitt trigger on a note, and the reason an a-rate input is
    // usable at all. Without it a value hovering on a boundary flips between
    // two notes on every sample.
    //
    // A boundary width, not a signal - it is read once per block, and a
    // hysteresis band that moved between two samples would not be one. The
    // default of 0.1 is a tenth of a semitone: enough to hold a wavering
    // input, small enough that nothing a player does lands in it.
    name: "hysteresis",
    defaultValue: 0.1,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // Structural: which of two quantities leaves the node, matched to
    // `QuantizerOutput`. Hertz and semitones are not two points on a
    // continuum, so there is nothing to interpolate between them, and a value
    // that crossed mid-block would emit half a block of each.
    name: "output",
    defaultValue: 0, // QuantizerOutput.Hz
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
];
