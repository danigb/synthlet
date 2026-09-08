---
"@synthlet/euclid": minor
---

`Euclid.pattern()` and the `EuclidRhythm` table — the pattern as a value.

`Euclid.pattern(steps, beats, rotation)` returns the array the node is playing,
as 1s and 0s. It is pure and control-thread: no `AudioContext`, no worklet,
callable in node, and it draws — a UI ring of LEDs is
`Euclid.pattern(...).map(...)`. It is not a reconstruction of what the module
plays but the same expression the engine rebuilds its pattern from, so the two
cannot drift.

**Purely additive. No parameter is added, no default moves, and no existing call
changes what it plays.**

Why it is closer to necessary than convenient: **`rotation: 0` is not the named
rhythm, and no rule says which rotation is.** Of the 22 rhythms Toussaint 2005
§4 publishes, 13 come out right at `rotation: 0` and 9 do not — and no stated
rotation rule does better: lexicographically-largest reproduces 5, lex-smallest
starting on an onset 13, biggest-gap-last 6, and the shipped generator already
gets 13. A necklace "disregards the starting point in the cycle"; where a
tradition enters it is ethnomusicology, not arithmetic. So the only way to find
out which rotation is the cinquillo is to look, and this is looking.

`EuclidRhythm` is the sixteen that have names, as `{ steps, beats, rotation }`
triples ready to spread:

```ts
import { Euclid, EuclidRhythm } from "@synthlet/euclid";

Euclid.pattern(8, 5, 6); // [1,0,1,1,0,1,1,0]  the cinquillo
Euclid(ac, { clock, ...EuclidRhythm.Cinquillo });
```

Tresillo E(3,8)+0, Cinquillo E(5,8)+6, BossaNova E(5,16)+12, Samba E(7,16)+0,
AshantiMpre E(7,12)+8, CentralAfricanRepublic E(9,16)+10, AkaPygmy E(11,24)+0,
Venda E(5,12)+0, KhafifERamal E(2,5)+2, Ruchenitza E(3,7)+4, Aksak E(4,9)+6,
Moussorgsky E(5,11)+8, Cumbia E(3,4)+0, Tuareg E(7,8)+0,
AkaPygmyUpperSangha E(13,24)+14, Zappa E(4,11)+0.

Every row is asserted against the paper's own box notation, cross-checked
against §5's interval vectors and against a reference Bjorklund, and the README
table is parsed by a test so the documented table and the shipped object cannot
diverge. If the table and the paper disagree, the paper wins.

**The presets are necklaces.** Where Toussaint distinguishes the necklace from
the rhythm as played, the preset is E(k,n) itself and the README carries the
played variants with their rotations. That resolves an apparent contradiction in
the notes: bossa-nova at `rotation: 6` is the rhythm _as played_ — the paper's
"usually starts on the third onset" — while `12` is the necklace. Both numbers
are right, about different things.

Both site demos were playing the wrong rotation of the bossa-nova and now spread
`EuclidRhythm.BossaNova`, so they keep no pattern numbers of their own.

**Fixed: `rotate()` returned a doubled pattern at rotations that are a non-zero
multiple of `steps`.** `n % len` was reduced _after_ the `n === 0` short-circuit,
so `rotation: 8` on an 8-step pattern fell through with `n` still 8, and
`array.slice(-0)` is the whole array - the pattern came back concatenated with
itself. It hit 482 of the 10100 `(steps, rotation)` pairs reachable from the
declared ranges. Inaudible through the worklet, where a doubled pattern is the
same rhythm over twice the steps; very much not inaudible through
`Euclid.pattern`, which is the array people read a rotation off, and which this
release makes public. The reorder is exactly behaviour-preserving on every input
the old form answered correctly: over `steps 1…64 × beats × rotation 0…100` the
only settings that change are the ones that used to come back the wrong length.
