---
"synthlet": patch
---

`SnareDrum.tone` now does something. It was exposed and typed like every other
drum's, but nothing in the snare read it: the two sine oscillators its body is
made of were hardcoded at 100 and 200 Hz.

`tone` now moves that pair, `Param.lin`-mapped to 60…140 Hz with the second an
octave above the first - the same shape the other nine drums use. The default
`tone` of `0.5` gives exactly 100 and 200 Hz, so an untouched snare sounds
exactly as it did.
