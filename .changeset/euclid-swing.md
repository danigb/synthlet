---
"@synthlet/euclid": minor
---

Add `swing`: the long-short division of the beat, applied against `subdivision`.

`swing` moves **one boundary inside each pair of steps** — a pair's two steps
start at `0` and `swing / (1 + swing)` of the pair rather than `0` and `0.5` —
and each step's phase is measured against its own, now unequal, length. So
`pulseWidth` still means "this fraction of _this_ step" and a swung step's gate
is not subtly wider than a straight one. It is a ratio: `1` is straight, `2` is
triplet feel, `3` is dotted-eighth. k-rate, `1 … 3`.

`swing: 1` is **bit-identical** to no swing rather than approximately equal —
the pair reduction is algebraically the step reduction at a swing point of 0.5
and every operation in it is exact in binary floating point. Measured: zero
differing samples over 46 million, across `subdivision` 1…20, six
`steps`/`beats` pairs, three widths and all five outputs.

Swing is applied against the **subdivision**, which is why the parameter is
here and not on `Clock`: at `subdivision: 4` these are sixteenth pairs, where a
warp on the beat phase would give a half-bar shuffle. At an **odd**
`subdivision` the leftover step is a straight, full-length one, so a clock cycle
always holds exactly `subdivision` boundaries — and at `subdivision: 1` that
makes swing exactly inert, because the step is the beat and there is nothing to
subdivide. The `pulseWidth` clamp is now computed against the **short** step of
a pair, the binding one, so `pulseWidth: 1` still retriggers under swing.
`.rests`, `.b`, `.c` and `.d` swing with the hits sample for sample, with
nothing per-output: all five are one step phase read five times.

This is the MPC/DAW constant-ratio convention rather than a model of jazz swing.
Honing & de Haas (2008), _Swing Once More_, test exactly that model and reject
it — real swing ratios are "systematically adapted to a global tempo", plateau
near 2.2:1 at slower tempi, and need "a more complex model". The knob is the
control users expect and can turn, and the README says so.
