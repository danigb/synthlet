---
"@synthlet/clip-amp": patch
---

`ClipAmp` now clips every channel of its input instead of only the first: a
stereo signal into it came out with the right channel silent.

If you compensated for the missing channel with a `Gain`, the result is now
about 3 dB hot.
