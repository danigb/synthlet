---
"@synthlet/arp": patch
---

Three defects, all reachable from the declared parameter ranges, all fixed
where the note is constructed.

**Notes stay under MIDI 127.** `baseNote` is declared 0…127 and `octaves` 1…10,
and at both maxima the module emitted MIDI 246 — 12.1 MHz — with 92 % of its
steps above Nyquist. At `baseNote: 96, octaves: 4`, which is a setting somebody
would plausibly dial, it was still 15 %. Nothing errored on any of them:
`polyblep-oscillator` caps `frequency` at 20000 and a native `OscillatorNode`
clamps to Nyquist, so every out-of-range note collapsed onto the same pitch and
the arpeggiator silently stopped moving at the top of its range. The note is now
folded down by octaves, which keeps the pitch class — a folded note is still a
member of the set, where a clamped one would not be.

**`octaves` is floored.** `Math.floor(random() * 2.5)` yields 0, 1 and 2 — three
octaves for a request of two and a half — and an `AudioParam` hands over a
fractional value from any ramp or any connected node.

**The output before the first trigger is the root.** The engine was seeded with
a literal 60, so `Arp(ac, { baseNote: 48 })` held 261.63 Hz — neither the root
nor a member of the set — until the first trigger arrived. For a module that
holds its output between triggers that is audible for as long as the clock takes
to tick.

`baseNote` is deliberately **not** floored: fractional values are fine tuning,
`baseNote: 60.5` is a quarter tone, and the README now says so.
