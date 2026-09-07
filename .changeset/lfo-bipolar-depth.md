---
"@synthlet/lfo": minor
---

Make `Lfo`'s depth bipolar: `gain` and `offset` are now `[-20000, 20000]`.

`gain` was `[0, 10000]` and `offset` `[-1000, 1000]`, where `@synthlet/ad`,
`@synthlet/adsr` and `@synthlet/param` — the other three packages computing
`x × gain + offset` — all declare `[-20000, 20000]`. An `AudioParam` clamps its
computed value to the descriptor's range, so the floor of 0 forbade a negative
depth even from a connected modulator: there was no way to invert an LFO short
of a whole `Param.inv` node for a sign, and inverted modulation is ordinary.

The wider `offset` makes the unipolar recipe expressible in the destination's own
units — a filter cutoff swept over its whole range is `gain: 10000, offset: 10000`.

No DSP change and no new parameter: `dsp.ts` never had a sign assumption. No
existing patch sounds different; `Lfo.descriptors` is public, so a UI built from
it renders different sliders.
