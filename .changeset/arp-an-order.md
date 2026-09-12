---
"@synthlet/arp": minor
---

`Arp` has an order. **Two behaviour breaks, both deliberate.**

```ts
export enum ArpMode {
  Up = 0,
  Down = 1,
  UpDownExclusive = 2, //  1 2 3 4 3 2 1 · 2 3 4 3 2 1
  UpDownInclusive = 3, //  1 2 3 4 4 3 2 1 · 1 2 3 4 4 3 2 1
  Random = 4, //           unchanged: uniform and memoryless
}
```

**`mode` defaults to `Up`, not to `Random`.** Preserving a defect through a
default is not compatibility. Pass `mode: ArpMode.Random` for the old
behaviour — it is still there, and still uniform, until the next release gives
it a memory.

**`scale` defaults to `ArpScale.TriadMinor` (137), not to `1`.** The root alone
is one note repeated forever, so `Arp(ac, { trigger })` was a module that could
not make music without being configured — the same class of defect as `euclid`'s
`steps: 0`. It is now a minor arpeggio, which is the thing the module is named
after and could not previously do at all.

A chord is a short scale, and the enum has known that since 0.1.0:
`scale: ArpScale.TriadMinor` with `mode: ArpMode.Up` is a minor arpeggio, and
`Sus4`, `Dominant7th`, `Major7th` and the rest were always there waiting for an
order to be played in.

Both `UpDown` variants are spelled out rather than merged behind a flag, because
the names cannot tell you which one you got and Arturia, u-he and PolyBrute all
ship the two. The published sequences are asserted verbatim.

Under the surface the engine now stores a **position**, not a note: one flat
index over the `len × octaves` sequence, mapped to a note when it is read. Three
things follow. `baseNote` transposes a pattern that is already running, because
the note is computed on read. The value held before the first trigger is the note
about to be played, with no special case. And the traversal refers to nothing but
an index and a length, so it lifts out whole the day the polyphonic voice module
wants the same modes over a stack of held notes.

The `size === 1` guard in the advance is a correctness item, not a nicety:
without it `UpDownExclusive` on a one-note set spins forever, and an unbounded
loop in a worklet is a render quantum that never returns. That case was reachable
from the shipped defaults until this release changed them.
