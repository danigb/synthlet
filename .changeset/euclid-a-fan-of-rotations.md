---
"@synthlet/euclid": minor
---

Add `spread` and three more outputs: four voices from one Euclidean pattern.

One necklace is several named rhythms at once. Toussaint 2005 keeps saying so and
it is easy to read past: E(9,16) started on its fourth onset is played in West and
Central Africa and is also the Brazilian samba cowbell, and started on its
penultimate onset it is the Ngbaka-Maibo bell pattern. Those are not variations on
a rhythm — they are the parts different players hold **simultaneously**, over one
cycle, and the module could play one of them.

`spread` is that as one knob. Channel _i_ plays
`Euclid.pattern(steps, beats, rotation + i * spread)`, so the node's own output is
channel a and `.b`, `.c` and `.d` are the same necklace entered `spread` steps at a
time further in:

```ts
const rhythm = Euclid(ac, {
  clock,
  subdivision: 4,
  ...EuclidRhythm.Samba,
  spread: 2,
});
KickDrum(ac, { trigger: rhythm }); // x..x.x.x..x.x.x.  rotation 0 — the samba necklace
TomDrum(ac, { trigger: rhythm.b }); // x.x..x.x.x..x.x.  rotation 2 — the samba as played
CongaDrum(ac, { trigger: rhythm.c }); // x.x.x..x.x.x..x.  rotation 4
ClaveDrum(ac, { trigger: rhythm.d }); // x.x.x.x..x.x.x..  rotation 6 — a clapping pattern from Ghana
```

Three of those four are rhythms the paper names, off one setting. It is one pattern
array read at four offsets and one step counter, so the four channels cannot drift
apart and one `reset` aligns every one of them — which four separate nodes could
not promise. The sign is the one the documentation counts in: the README's table of
Toussaint's played variants gives them as positive rotations, so a user who reads
that table and sets `rotation: 0, spread: 2` gets the rhythms it names.

**`spread: 0` is unison and is the default**, so nothing that does not set it plays
differently — output 0 is unchanged at every setting, asserted at the engine and
through the processor. `spread` equal to `steps` is unison again, a consequence of
the arithmetic rather than a special case.

At `steps: 16, beats: 5, spread: 4` the four channels tile the cycle — every step
filled, none struck by more than two of the four voices:

| design                                  | silent |  1 hit |     2 |     3 |     4 |
| --------------------------------------- | -----: | -----: | ----: | ----: | ----: |
| independent `beats` 4/5/7/9, rotation 0 |      1 |      8 |     5 |     1 |     1 |
| **one pattern, `E(5,16)`, `spread: 4`** |  **0** | **12** | **4** | **0** | **0** |

Two things the docs say rather than gloss. **Tiling is a property of that setting,
not of `spread`**: on the same `E(5,16)`, `spread: 3` leaves eight of sixteen steps
silent and strikes two of them with all four voices — a worse profile than the
independent-`beats` row it is contrasted with. Four of the sixteen spreads tile and
one is unison; both profiles are pinned as tests so the claim cannot be generalised
by a later edit. And **no single `spread` reaches all three of E(9,16)'s published
entry points** — they are rotations 5, 10 and 14, spaced 5 and 4, where `spread`
gives evenly spaced entry points. A tradition's entry points are not evenly spaced.
That is the same finding as "there is no canonical origin", one level up.

`.rests` stays the complement of **channel a only**. That is not an omission: the
complement commutes with rotation, so the complement of any other channel is one
patched node away at the rotation you want, where the base complement is reachable
from no second node at all — which is why that one is an output and these are not.

The cost is four array reads per sample and **no** new state. The engine in fact
holds one closure variable fewer than it did with two outputs: `step()` now returns
the shared pulse and `generate()` does all five reads itself, which removes the
`restLevel` variable that would otherwise have had to become four.

Measured in node at 48 kHz, 128-sample blocks, one case per process with warm-up,
min of ten runs within a process and min across five processes:

| engine             |  output buffers | µs/block |
| ------------------ | --------------: | -------: |
| before this change |               1 |     0.80 |
| before this change |  2 — production |     0.86 |
| this change        |               1 |     0.86 |
| this change        |               2 |     0.93 |
| this change        | 5, any `spread` |     1.65 |

So all five outputs connected cost **+0.79 µs on a block whose budget is 2667 µs —
0.030 % of one core**, and one or two connected outputs cost what they did. The
machine was not idle (load average ~12 on 14 cores); `min` is only partly robust to
that, so read these as an upper bound on the true figures. Not in the engine's
budget and not measurable from node: the browser also allocates and zero-fills five
128-sample output buffers per block instead of two, and the graph carries four idle
`GainNode`s per `Euclid` instead of one.

One number in that table was earned rather than found. The block-scoped offset is
written `(n - (s % n)) % n` and not the more obvious `((-s % n) + n) % n`, because
the latter evaluates `-0` whenever `spread` is a multiple of `steps` — `-0 % 16` is
`-0`, which is a double rather than a Smi — and V8 then gives the per-sample `%` in
the render loop double type feedback. Measured, the obvious form cost 2.30 µs/block
against 1.65 at exactly those settings and was flat either side of them. Those
settings are the unison ones, and `spread: 0` is one of them, so the obvious form
put a 40 % penalty on the path every existing caller takes. The two expressions are
numerically identical over `n` 1…64 and `s` −200…200.
