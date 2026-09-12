---
"@synthlet/arp": patch
---

The README and the docs page, rewritten for the module that now exists — and the
WIP callout deleted. It read "This module is WIP. Currently it only generates a
random note from a given scale", which was true when it was written and is the
single most visible thing this folder fixes.

Two things were never documented at all and are now stated in the first screen
of both:

- **MIDI in, hertz out.** `baseNote` is a MIDI note number and the output is a
  frequency in hertz, so it connects straight to an oscillator's `frequency`.
  Every arpeggiator a reader has used emits note events for something else to
  turn into pitch; this one does not, and nothing said so.
- **`baseNote` is continuous.** `60.5` is a quarter tone. That was a decision, not
  an accident, and it was undiscoverable.

Plus the section a reader arriving from any other arpeggiator needs first: what
this does not do, and where it lives instead. Rate, gate length, swing and
rhythm are `Clock` and `Euclid`; a ratchet is a faster `Clock` gated by the step.
Held notes, latch and as-played order belong to the arpeggiator mode of the
polyphonic voice module, because a worklet cannot receive `noteOn` — same
vocabulary, two tiers.

`ArpMode` and `ArpOctaveMode` are now named in the umbrella package's explicit
enum re-exports. `tsup`'s dts bundler drops enums from `export *`, so without
those lines they existed at runtime but not in the published types — the same
trap `ArpScale` and six other enums already had a line for.

`docs.test.ts` gains an `arp` entry, which is what caught the parameter table
being wrong: two tickets had edited it by string replacement, Prettier had
realigned the columns since, and `mode`'s range and the entire `octaveMode` row
were silently never written. The table is now checked against `descriptors` in
both directions, in the README and on the page, along with the defaults, the
rates and both mode tables.

The site example is rebuilt around the feature rather than the defect: a mode
selector, an octave-mode selector, and a chord progression automating `scale`
from four pitch-class masks over one root — the thing no hardware arpeggiator can
do, because in every one of them the chord is in your fingers.
