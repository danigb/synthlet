---
"@synthlet/virtual-analog-filter": patch
---

Bound the cutoff, so `detune` cannot blow the filter up.

`detune` is declared ±127 semitones, so `frequency: 1000, detune: 127` — both
inside their declared ranges — asked for a 1.54 MHz cutoff, and every prewarp
in the package diverges past Nyquist. One block of noise at that setting
returned `Infinity` on `DIODE_LADDER` and a peak of 5.6 × 10²¹ on
`MOOG_LADDER`. The `Infinity` was then permanent for the life of the node.

The tangent is replaced by Zavalishin's continuous-speed bounded prewarping
(_The Art of VA Filter Design_, §3.8 eq. 3.23): it follows `tan(πf/fs)`
below a ceiling at 0.72 of Nyquist and continues it as a tangent line above,
so `g` is finite, positive and strictly increasing from 0.013 Hz to 1.54 MHz
at every sample rate from 8 kHz to 96 kHz.

The _continuous-speed_ variant rather than the plain bounded one, because a
hard breakpoint puts a discontinuity in `dg/df` and Zavalishin says what that
costs: "a sudden change of the perceived modulation speed as the cutoff
traverses through the prewarping breakpoint". An a-rate cutoff being swept is
this package's point. 0.72 of Nyquist is 15876 Hz at 44.1 kHz, Zavalishin's
"around 16 kHz" to within 0.8 %, and it scales with the sample rate — the same
ceiling `@synthlet/state-variable-filter` uses, so a cutoff means the same
thing in both filters.

**Below the ceiling nothing moves**: `prewarp(f)` is bit-identical to the
`Math.tan` it replaces, and every measured corner reproduces to the digit.

`detune` keeps its ±127 range. The range was never the bug; the bug was that
the DSP trusted the product of two in-range parameters to be in range.
