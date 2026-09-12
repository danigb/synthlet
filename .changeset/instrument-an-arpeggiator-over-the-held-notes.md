---
"@synthlet/instrument": minor
"@synthlet/arp": patch
---

Arpeggiator over the held notes

`Instrument` gains `arp`, `latch`, `arpStep(time, duration)` and `arpReset()`:
hold a chord, call `arpStep` on the beat, and the instrument breaks the chord
across its own allocator with each note's own velocity. The pattern is one
assignable value - `synth.arp = ArpConfig("UpDownExclusive", { octaves: 2 })`,
`synth.arp = null` for a plain poly - with a press order, a `"Chord"` mode, up
to four octaves and two octave mappings. `arp` is a reserved preset key, so a
pattern travels with a sound.

`priority` and `steal` now take names (`"low"`, `"protect"`) rather than enum
members at the `Instrument` surface, so a stored preset reads as JSON and a bad
value throws naming itself. `NotePriority` and `StealMode` are still exported
and still what the public `createVoiceAllocator` and `createNoteStack` take.

`@synthlet/arp` takes a patch for a code move alone: the traversal it shares
with the new arpeggiator now lives in a copied `_traversal.ts`, with no change
to its API, its parameters or its behaviour - its whole suite passes unedited.
