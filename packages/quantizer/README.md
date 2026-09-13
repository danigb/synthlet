# @synthlet/quantizer

> Snap a note number to a scale — Part 16's programmable scale generator

Part of [Synthlet](https://github.com/danigb/synthlet).

Semitones in, hertz out. Feed it a signal that wanders and it comes back
landing on notes of the scale you picked. A sample-and-hold of noise in front of
it is the book's random arpeggiator; a slow LFO in front of it turns a
portamento into a glissando; `Scale.Chromatic` with no hysteresis makes it a
plain note-number-to-hertz converter.

## Install

```bash
npm i @synthlet/quantizer
```

Or `npm i synthlet` for every module at once.

## Usage

```ts
import {
  registerQuantizerWorklet,
  Quantizer,
  Scale,
} from "@synthlet/quantizer";

const ac = new AudioContext();
await registerQuantizerWorklet(ac);

// Noise -> sample & hold -> two octaves of note numbers -> a pentatonic scale
const notes = Param(ac, { input: sampleHold, gain: 12, offset: 60 });
const pitch = Quantizer(ac, { input: notes, scale: Scale.PentatonicMinor });
pitch.connect(osc.frequency);
```

## Semitones in, hertz out

Reid's quantiser rounds a 1 V/oct control voltage to the nearest twelfth of a
volt. This library has no volts: every pitch inlet in it is a frequency —
`PolyblepOscillator.frequency`, `Svf.frequency`, `KarplusStrong.frequency` — and
frequency is the wrong unit to quantise in, because a semitone is a _ratio_ and
not a number of hertz.

So the module works in MIDI note numbers, fractional, and converts on the way
out. Two things follow.

**Feeding it is `Param`'s job.** A `SampleHold` of noise is a signal in
[−1, 1]; `Param(ac, { input: sh, gain: 12, offset: 60 })` makes that two
octaves of note numbers centred on middle C. There is deliberately no
`gain`/`offset` on this module — that would be a second `Param` hidden inside
it.

**It is the converter the slew limiter asks for.** `SlewLimiter` glides evenly
in whatever unit it is given, so slewing hertz glides fast at the bottom and
slowly at the top. Slew the _note number_ and pass it through here and the
portamento is even in pitch:

```ts
const glide = SlewLimiter(ac, { input: notes, rise: 0.2, fall: 0.2 });
const pitch = Quantizer(ac, {
  input: glide,
  scale: Scale.Chromatic,
  hysteresis: 0,
});
```

## Parameters

| Param        | Default | Range    | Rate   | Meaning                                             |
| ------------ | ------- | -------- | ------ | --------------------------------------------------- |
| `input`      | 60      | 0 … 127  | a-rate | The note number to snap. A fractional MIDI note     |
| `scale`      | 4095    | 1 … 4095 | k-rate | 12-bit pitch-class mask, bit 0 the root             |
| `root`       | 0       | 0 … 11   | k-rate | Pitch class of the root, semitones above C. Floored |
| `hysteresis` | 0.1     | 0 … 1    | k-rate | Semitones past a boundary before the note changes   |
| `output`     | 0       | 0 … 1    | k-rate | `QuantizerOutput.Hz` or `QuantizerOutput.Note`      |

`input` is a-rate because the two patches this module exists for need it to be:
a glide has to step at the sample it crosses a boundary, not at the top of the
next render quantum — 2.9 ms later at 44.1 kHz, and by a different amount every
time. A stepped source costs nothing extra for it.

## Nearest allowed note, ties up

Reid's Table 1 gives each note a band from −1/24 V inclusive to +1/24 V
exclusive. Generalised to a scale that is not chromatic, the same rule applies
to the two nearest **allowed** notes: the boundary between them is their
midpoint, and the band is half-open, so a value exactly on it takes the upper
note.

In C major, C4 (60) and D4 (62) are neighbours and nothing lies between them, so
their boundary is 61.0:

| `input` | In C major | Why                           |
| ------- | ---------- | ----------------------------- |
| 60.4    | C4         | 0.4 from C, 1.6 from D        |
| 60.9    | C4         | 0.9 from C, 1.1 from D        |
| 61.0    | D4         | equidistant — the tie goes up |
| 61.5    | D4         | 1.5 from C, 0.5 from D        |

That is worth spelling out because the obvious guess — round to the nearest
semitone, then snap that to the scale — gives D for 60.9, and is a different
module: it quantises twice and its boundaries are not where a listener's ear
puts them.

## Hysteresis is a Schmitt trigger on a note

A value hovering on a boundary would flip between two notes on **every sample**.
From a sample-and-hold you would never hear it; from a slewed or LFO'd input it
is a buzz, because the note is switching at audio rate.

So the module remembers the current note's boundary zone and only looks up a new
note when the input leaves it, widened by `hysteresis` on both sides. Braids'
quantiser is built the same way, and it is also why the module costs nothing per
sample: the hot path is two comparisons against a cached pair of numbers.

With the default 0.1 and C major, a ramp from 60 to 62 switches to D at 61.1 and
has to fall back below 60.9 to return to C.

```ts
// A converter and nothing else: every semitone maps to its own frequency.
Quantizer(ac, { scale: Scale.Chromatic, hysteresis: 0 });
```

## The scale is a bitmask

A scale is a 12-bit pitch-class mask: bit `i` set means pitch class `i` —
`i` semitones above the root — is allowed. Bit 0 is the root, so C major is
`[0,2,4,5,7,9,11]` = `0b101010110101` = 2741, and **any** number in 1…4095 is a
valid scale. The `Scale` enum names 28 of the useful ones.

`root` moves the whole mask: `Scale.Major` with `root: 2` is D major.

The table and its decoder live in `scripts/_scales.ts` and are copied into this
package and into `@synthlet/arp`, which publishes the same 28 members as
`ArpScale` because it named them first. They are the same numbers by
construction — the repo asserts the file is byte-identical across its copies —
which is what makes the pair work: `scale` is an `AudioParam` on both modules,
so one value, or one node, can drive an arpeggiator and a quantiser at once and
they will be in the same key.

## `Note` output

`output: QuantizerOutput.Note` emits the MIDI number instead of the frequency,
for the two cases that want it: a second quantizer downstream, and a `detune`
inlet in cents through `Param.mul(ac, quantizer, 100)`.

## Not in this module

**No trigger output.** Braids and Marbles emit a gate when the note changes, and
an envelope fired by a new note is a real patch. It is a second output, which
means a different node shape, and it deserves its own ticket once something
asks. The random-arpeggiator patch does not need one — the clock that drives the
sample-and-hold drives the envelope.

**No weighted or progressive quantisation.** Marbles' single "amount" knob —
root only, then a power chord, then the full scale — is a better one-knob UX and
a different module surface. `scale` as a mask is the seam it would land on.

**No note names.** A mask is a number and a note is a number. Naming them is a
job for a music-theory library, not for a worklet.

**No `gain`/`offset`.** `Param` already is that module.

## License

MIT © [danigb](https://github.com/danigb)
