---
"@synthlet/euclid": patch
---

Rewrite the README and the docs page against the finished module, and land the
benchmark three tickets deferred.

Eight tickets each updated the docs for their own change, which kept the package
from being described wrongly but did not produce a page that describes it well.
The README is now the idea / Install / Usage / **Named rhythms** / Five outputs /
Parameters / Swing / The generator: the table a reader comes back for moves from
seventh to fourth, because it is the answer to the page's most likely question
and everything above it is forty lines. The docs page keeps the live demo and
gains a Recipes section; every table stays in the README and the page links it,
so there is no third copy of anything.

The "there is no canonical rotation" argument was being made twice, in different
words, seventy lines apart — once under `## The generator` and once under
`## Named rhythms`. It is now made once, next to the table that answers it, and
`Euclid.pattern` is introduced once rather than twice.

Corrections this pass found, all of them live falsehoods on the docs page: the
usage block spread `EuclidRhythm.BossaNova` under inline comments showing a
tresillo and its complement; `an euclidean` survived in the frontmatter and the
opening sentence; and the `Clock` cross-link pointed at `/docs/sequencers/clock`,
which 404s — `(sequencers)` is a fumadocs route group and is dropped from the
URL, so the page is served at `/docs/clock`. Verified against a static export,
not read off the slug builder.

`## Parameters` gains the two things it never said: that `spread` rebuilds
nothing, and that `rotation` **clamps** on the node where `Euclid.pattern`
**wraps** — `Euclid(ac, { rotation: -2 })` plays `rotation: 0` because the
parameter declares `minValue: 0`, while `Euclid.pattern(8, 3, -2)` returns what
`rotation: 6` returns. Both are deliberate and nothing documented either.

New tests, all of them closing gaps rather than fixing defects — no behaviour
changes in this release: every rotation of `E(5,16)` driven end to end through
the processor and asserted all sixteen distinct; `rotation` reduced modulo
`steps` past the declared maximum, replacing an existing case that only appeared
to cover it (`{ steps: 7, beats: 9, rotation: 40 }` makes every step a hit, so no
rotation is observable in it); `rotation` and `steps` changing mid-cycle under a
live step counter, counting step _boundaries_ rather than hits so a dropped or
duplicated step fails even when it lands on a rest; and a guard that parses the
README's parameter table against `PARAMS`, which was the third hand-maintained
copy of a list whose second copy made `pulseWidth` unreachable for two releases.

`benchmarks/euclid-rate/` is new, and reconciles two numbers the folder published
without saying which was which. Ticket 07's `wrapPhase` claim was 5.8x, its
implementation measured 7.9x; under 07's own harness this machine reads **5.9x at
`subdivision: 20`**, and the spread is the input distribution rather than the
change. Inside the engine's per-sample step it is **1.5x and 0.23 µs/block —
0.009 % of one core**, which is the honest size of that argument. Five output
buffers cost **+0.68 µs/block** over one (0.026 %), `swing` costs nothing
measurable at any setting, and ticket 06's unexplained "`spread: 0` is slower
than `spread: 4`" does not reproduce: it was the machine's load. The runner
exits non-zero above half a core of load average and prints the load it ran at,
so that cannot happen silently again.
