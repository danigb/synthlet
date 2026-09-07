---
"@synthlet/lfo": patch
---

Document the LFO properly.

`packages/lfo/README.md`'s parameter table is rebuilt from `Lfo.descriptors` and
now carries every parameter — two tickets' rows had been lost to a string
replacement that stopped matching after Prettier realigned the table's columns,
and nothing said so. `packages/synthlet/src/docs.test.ts` is the assertion that
this cannot happen again: the README's and the docs page's parameter tables must
name exactly the parameters that exist, with their declared ranges and rates, and
the two shape tables must agree character for character.

The docs page gains a live example — `LfoExample` draws the LFO's own output on a
scope with the shape gallery, vibrato, delayed vibrato and tempo sync, and
`LfoStackExample` shows two 0.3 Hz LFOs with and without `phase: "random"` — plus
a Behaviour section and callouts for the three things a reader otherwise gets
wrong.

No behaviour change.
