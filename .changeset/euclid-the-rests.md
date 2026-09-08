---
"@synthlet/euclid": minor
---

Add `.rests`, a second output playing the steps the pattern leaves empty.

The one rhythm that pairs perfectly with a Euclidean pattern was the one you
could not patch. The complement of a Euclidean rhythm is a Euclidean rhythm —
Morrill 2022's Lemma 3, _"Euclidean rhythms distribute their rests in the same
manner as their notes"_ — so the rests of `E(k,n)` are `E(n−k,n)` at some
rotation. But across all 2016 pairs with `1 ≤ k < n ≤ 64` that rotation is
**never 0**: `E(3,8)`'s rests are `E(5,8)` rotated by 5, `E(5,16)`'s are
`E(11,16)` rotated by 3. A second `Euclid` node at `beats: steps - beats` plays
the right necklace from the wrong place — it collides with the first instead of
interlocking — and there is no rotation value a user can work out by ear.

```ts
const rhythm = Euclid(ac, { clock, steps: 8, beats: 3 });
KickDrum(ac, { trigger: rhythm }); // x . . x . . x .
HiHatDrum(ac, { trigger: rhythm.rests }); // . x x . x x . x
```

Purely additive: output 0 is sample-identical at every setting, verified
against a render that hands the engine no second buffer at all. Zero new
parameters — both outputs are one step read twice, sharing one pattern, one
step counter, one clamped `pulseWidth` and one `reset`, so they partition every
step and cannot skew. `steps: 0` is silence on both.

The node now declares `numberOfOutputs: 2` and hangs a `GainNode` off output 1,
the way `Clock` does for `.gate`; `rhythm.dispose()` disposes it too. Measured
cost of the second write at 48 kHz, 128-sample blocks: 0.789 µs/block for the
old one-output engine, 0.912 with the second output unwritten, 1.081 with it
written — worst case **+0.29 µs against a 2667 µs block budget, 0.011 % of one
core**. Not zero: the gain is created eagerly, so output 1 is always connected
in the browser and the write always happens.
