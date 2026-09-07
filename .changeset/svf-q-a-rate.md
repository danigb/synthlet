---
"@synthlet/state-variable-filter": minor
---

`Q` is now a-rate: resonance tracks a modulator instead of being sampled once per block.

**This changes the sound of any patch that automates `Q`.** That is the fix, not a side
effect: a resonance envelope was a 344 Hz staircase, and a modulator faster than that was
not quantised but aliased.

`Q` was k-rate with a comment that called itself "a bet, and a weak one" and named the
obstacle as shape rather than cost. It was right about the cost. It is also the last
disagreement between the library's two filters — `virtual-analog-filter` moved `resonance`
a-rate for exactly these reasons — and "nobody would modulate it" was never one of the two
grounds a k-rate declaration is allowed to stand on. `type` stays k-rate on the ground that
does apply: it is an index into a set of output mixes, and lowpass→highpass mid-block is a
discontinuity rather than a sweep.

**Measured cost.** An unmodulated filter pays nothing — 0.084% of a core, unchanged, because
Chrome delivers a length-1 array for a constant and the DSP takes the branch it always did.
A filter with both cutoff and `Q` automated goes from 0.201% to 0.261% of a core, **+30%**,
not the +4.6% the audit predicted: a per-sample `Q` adds a second division, and a division
is most of what a sample of this filter costs. In absolute terms it is a quarter of one
percent of a core per voice.
