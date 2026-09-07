---
"@synthlet/state-variable-filter": patch
---

Recover from a non-finite input instead of dying permanently, and add `reset()`.

`_ic1eq` and `_ic2eq` feed back into themselves every sample, so one `Infinity` at the
input made both `NaN` and there was no arithmetic path back: the node emitted `NaN` for the
rest of the `AudioContext`'s life, and — until the previous release — never stopped being
scheduled either. A hundred clean blocks later it was still `NaN`.

The filter does not produce this itself; the cutoff prewarping removed the one internal
source. This is about what arrives at the input, which the package does not control: an
upstream divide by zero, a `GainNode` driven by an unconnected parameter, a decoded buffer
with a bad sample. `BiquadFilterNode` absorbs it because a finite delay line flushes; a
recursive filter with feedback state has nothing to flush.

The state is now checked once per block rather than the input once per sample — two
comparisons against a loop that already costs about 21 ns a sample, and it catches every
route in rather than only this one. A poisoned filter recovers within one render quantum:
a click, which is the honest answer to a signal that was already broken.

`createFilter` now returns `{ filter, reset }` instead of a bare function, matching
`digital-delay`'s `{ compute, update }`. This is internal to the package — `Svf`, `SvfType`
and `registerSvfWorklet` are unchanged.
