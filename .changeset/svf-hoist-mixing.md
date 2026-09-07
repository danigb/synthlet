---
"@synthlet/state-variable-filter": patch
---

Hoist the output mixing coefficients out of the per-sample path.

`update()` recomputed `m0`, `m1` and `m2` on every sample of an automated block, and none
of them depends on the frequency: the seven-arm switch reads only constants and `k = 1/Q`,
both of which are k-rate. It is now two functions — one for the mix, which runs when `type`
or `Q` changes, and one for the cutoff, which runs per sample. Nothing in the sample loop
reads `type`.

Output is bit-identical: 70 rendered cases (seven types × five Q values × automated and
static cutoff, two seconds each, driven block by block) hash the same before and after.

The measured gain is **2.3%** on Node 24 / Apple Silicon, not the 31% the audit predicted
from the same split — the per-sample cost is the tangent and the division in `a1`, and the
switch is a rounding error beside them. The change is worth taking for its shape rather
than its speed: it is what lets `Q` move to a-rate without writing the sample loop twice.

Also deletes a `let freq = frequency[i]` that was assigned and never read.
