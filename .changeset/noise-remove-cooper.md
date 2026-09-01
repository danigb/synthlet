---
"@synthlet/noise": minor
---

Remove the second, undocumented pink noise algorithm. Passing the raw `type`
value `2` selected a pink noise generator whose licence terms could not be
established; it is now unrecognised and falls through to the white noise
default. It was never listed by `getNoiseTypes()` nor documented, so
`NoiseType.White` and `NoiseType.Pink` are unaffected.

Adds the CC BY 4.0 attribution required by the remaining pink noise algorithm
("A New Shade of Pink" by Larry Trammell).
