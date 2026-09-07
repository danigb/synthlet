---
"@synthlet/state-variable-filter": minor
---

Three new responses — `Bell`, `LowShelf`, `HighShelf` — and the `gain` parameter they need.

`SvfType` carried `// Not implemented yet // LowShelf = 7 // HighShelf = 8` since the
package was written. All three exist in the paper this package ports; they were left out
because they need a fourth parameter and nobody added one.

`gain` is in dB, defaults to `0`, and ranges `[-40, 40]`. Only these three types read it —
for the other seven it is inert — and `gain: 0` is an exact bypass, not merely close.

The coefficients are read from the rendered `Solve[]` cells of Simper's notebook PDF. The
_code_ cells are glyph placeholders in both the PDF and its markdown conversion, so the
solution cells are the only trustworthy source, and they give the high shelf's `m1` as
`-(-1 + A) k A` — the sign that a plausible reconstruction gets backwards, turning a +12dB
shelf into a 14.67dB resonant bump.

**`Q` on these three sets the resonance of the corner.** At or below 0.7071 the response
stays inside the requested gain; above it the corner peaks, which is what a resonant shelf
is for. Measured on a +12dB shelf: 12.000dB at Q=0.7071, 21.8dB at Q=4, and 36.5dB (low) or
40.9dB (high) at Q=40. At Q=0.025 the shelf is so gentle it only reaches 9.6dB inside the
audio band. All of that is asserted rather than assumed.

The seven existing responses are bit-identical.
