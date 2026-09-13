---
"@synthlet/quantizer": minor
"synthlet": minor
---

`Quantizer`: snap a note number to a scale — Part 16's programmable scale
generator.

```ts
const notes = Param(ac, { input: sampleHold, gain: 12, offset: 60 });
const pitch = Quantizer(ac, { input: notes, scale: Scale.PentatonicMinor });
pitch.connect(osc.frequency);
```

That patch is the book's Figure 15, and Reid's note on it is the reason the
module exists: _"particularly pleasing if you make the defined scale an arpeggio
because you then have a random arpeggiator — one of my favourite effects."_ Put
a slow `Lfo` or a `SlewLimiter` where the sample-and-hold is and it is
Figure 14 instead — a continuous rise comes out as a staircase, which is the
difference between portamento and glissando.

**Semitones in, hertz out.** Reid's quantiser rounds a 1 V/oct voltage to the
nearest twelfth of a volt; this library has no volts, and frequency is the wrong
unit to quantise in because a semitone is a _ratio_ and not a number of hertz.
So the module works in fractional MIDI note numbers and converts on the way out,
memoised on the note the way `Arp` does it. Feeding it is `Param`'s job — there
is deliberately no `gain`/`offset` here, because that would be a second `Param`
hidden inside the node.

It is also the converter [slew-limiter's docs page](https://danigb.github.io/synthlet/docs/modulators/slew-limiter)
promised: slewing hertz glides unevenly in pitch, slewing the note number and
passing it through here does not. With `Scale.Chromatic` and `hysteresis: 0`
this is a plain note-to-hertz converter and nothing else, which is why there is
no second module for that and no `MidiToHz` scale type on `Param`.

**Nearest allowed note, ties up, and the boundary is the midpoint.** Reid's
Table 1 gives each note a half-open band; generalised to a non-chromatic scale
the same rule applies to the two nearest _allowed_ notes. So in C major the C/D
boundary is 61.0, `60.9` is a C — 0.9 from C against 1.1 from D — and `61.0` is
a D. That is worth stating because the obvious guess, round to the nearest
semitone and then snap, gives D for 60.9 and is a different module.

**Hysteresis is a Schmitt trigger on a note**, and it is what makes an a-rate
input usable: a value hovering on a boundary would otherwise flip between two
notes on every sample — inaudible from a sample-and-hold, a buzz from a slewed
one. It is also why the module costs nothing per sample. The state is the
current note's boundary zone, the hot path is two comparisons against it, and
the search runs only when the input leaves it. Braids' quantiser is built the
same way. Asserted: a constant input over 60 s of samples is bit-identical and
the search has run exactly once.

`input` is **a-rate**, so a glide steps at the sample it crosses a boundary
rather than at the top of the next render quantum — 2.9 ms later at 44.1 kHz,
and by a different amount every time. A stepped source costs nothing extra for
it. `scale`, `root`, `hysteresis` and `output` are k-rate: a set is not a
quantity, a boundary width that moved between two samples would not be one, and
hertz and semitones are not two points on a continuum.

`output: QuantizerOutput.Note` keeps the value in semitones, for a second
quantizer downstream or a `detune` inlet in cents through
`Param.mul(ac, quantizer, 100)`.

Out of range clamps rather than wrapping, NaN becomes MIDI 0 rather than a NaN
in the graph, and the whole module is rate-independent — 44.1 kHz and 48 kHz are
asserted identical, which is what says it has no filter and no clock.

Its parameter table joins `docs.test.ts`, checked against the descriptors in
both directions and in both documents.

Deliberately not here: a trigger output on a note change (a second output, so a
different node shape, and the clock that drives the sample-and-hold already
drives the envelope); weighted or progressive quantisation, which is Marbles'
one-knob UX and a different surface; and note names, because a mask is a number
and a note is a number.
