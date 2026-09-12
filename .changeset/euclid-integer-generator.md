---
"@synthlet/euclid": minor
---

`Euclid`'s generator now counts in integers, and `beats: 0` is silence.

The pattern has always been Morrill's construction — a Bresenham line walked
over the step grid — but it was evaluated as `Math.floor(i * (beats / steps))`.
`beats / steps` is a binary float, `i * (beats / steps)` accumulates its rounding
error, and near a step boundary that error was enough to move an onset. It is now
the same construction stated as Morrill 2022 §4 states it, on the descents of the
residue row:

```ts
pattern[i] = (i * beats) % steps < beats ? 1 : 0;
```

`i * beats` peaks at 10000 over the declared range, far inside exact float64, so
nothing can round.

**39 patterns inside the declared range change, and they were wrong.** Each one
violated Morrill's Corollary 2 — a rhythm's minimal period must occur
`gcd(beats, steps)` times — so each was not a Euclidean rhythm at all, and none
of them was even a rotation of the correct one. `E(18,66)` is the clearest: with
`gcd(18, 66) = 6` it must be six repetitions of an 11-pulse cell, `(4 4 3)` six
times, and the float form gave `4 4 3 4 4 3 4 4 3 4 4 3 4 4 4 3 4 3` — four clean
cells and then a pattern with no repeating period at all.

The full set, all of them at `steps >= 44`:

`E(30,44) E(26,46) E(30,52) E(18,66) E(36,66) E(45,66) E(39,69) E(21,77)
E(42,77) E(45,78) E(62,78) E(46,86) E(62,86) E(24,88) E(30,88) E(48,88)
E(60,88) E(26,90) E(52,90) E(66,90) E(26,92) E(52,92) E(84,92) E(6,94)
E(12,94) E(24,94) E(48,94) E(62,94) E(2,98) E(4,98) E(8,98) E(16,98)
E(32,98) E(54,98) E(64,98) E(27,99) E(54,99) E(58,100) E(70,100)`

**Nothing at `steps <= 43` moves.** Every named rhythm — the tresillo, the
cinquillo, the bossa, the samba — is byte-identical, and asserted so.

Separately, **`beats: 0` is now silence.** The old loop seeded its accumulator at
`-1`, so step 0 always compared unequal and always became an onset: `E(0,8)` was
`[1,0,0,0,0,0,0,0]`. That contradicted Morrill's Lemma 2, "contains exactly k
notes", at every one of the 100 declared `steps` values. Zero beats is now zero
hits, the same way `steps: 0` is already silence. `beats` at or above `steps`
remains every step, now as a written decision rather than a side effect.

Both lemmas are asserted over every declared setting, `0 <= beats <= steps <=
100`, and the generator is checked against a reference Bjorklund — an
independent construction — over all 528 rhythms with `steps <= 32`: 291
identical, 237 a rotation, none different. The rotation-equivalence that makes
`E(k, N)` the Euclidean rhythm is unchanged, and no pattern's origin moves.
