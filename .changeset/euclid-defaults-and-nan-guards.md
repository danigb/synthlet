---
"@synthlet/euclid": minor
---

`Euclid` no longer puts `NaN` in the graph, and its defaults make a sound.

`steps` and `beats` both defaulted to `0`, so `euclid(0, 0)` was the empty
pattern and `pattern[0] * gate` was `undefined * 1`. `Euclid(ac, { clock })` —
the README's own usage block — emitted `NaN` on every one of 25600 samples from
block 0, and a `NaN` reaching a destination silences that branch of the graph
for the lifetime of the context in Chrome. They now default to `8` and `3`: the
tresillo, the rhythm the module is named for.

Two more paths of the same shape are closed at the source, because `steps: 0` is
a declared minimum and a module should not depend on nobody setting it:

- **Turning a `steps` knob down.** The pattern is rebuilt when `steps` changes,
  but the step counter was only reduced on a step boundary, so between the two it
  could point past the end — `E(5,16)` to `E(3,8)` gave `NaN` at 5 of the 16 step
  offsets, worst case 121.9 ms. The counter is now clamped where the pattern is
  rebuilt.
- **`reset` with `steps: 0`.** It aimed at `pattern.length - 1`, which is `-1`
  when there is no pattern.

`steps: 0` now outputs exactly zero — the honest reading of "a pattern with no
steps".

`steps`, `beats` and `rotation` are also floored. All three are counts arriving
from an `AudioParam` as floats, and uncoerced `steps: 8.5` was a nine-step
pattern, `beats: 3.5` put four onsets in what should be `E(3,8)`, and
`rotation: 2.5` returned a seven-step pattern from an eight-step one.

Nothing else moves: a `Clock` -> `Euclid` chain is sample-identical to the
previous build over 448 parameter cells and 11.5 M samples, `steps: 16, beats: 5`
among them. What is new is the test the module has never had — 768 settings
across the declared range, 200 blocks each, every sample asserted finite.
