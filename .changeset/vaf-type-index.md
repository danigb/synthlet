---
"@synthlet/virtual-analog-filter": patch
---

Read `type` as `params.type[0]` rather than as the whole `Float32Array`.

`Math.floor(params.type)` has been in this processor since it was written, and it has
always produced the right answer: `Math.floor` coerces its argument, a `Float32Array`
stringifies through `Array.prototype.join`, and a length-1 array stringifies to its single
value. `type` is `k-rate`, so the array is always length 1.

Correct by accident. Hand this parameter more than one value and it stringifies to
`"3,3,3"`, `Number("3,3,3")` is `NaN`, and `bank[NaN] || bank[0]` selects the Moog ladder
for every type — with no error, no warning, and audio that still sounds like a filter. No
behaviour changes today; the filter stops being one line away from a silent bug.
