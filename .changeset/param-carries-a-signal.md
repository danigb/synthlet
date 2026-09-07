---
"@synthlet/param": patch
---

**`Param` can carry a signal.** `input` and `mod` are now `a-rate`, and the processor
reads them per sample.

`Param` is the module that implements the library's central bet — numbers and nodes are
interchangeable at every parameter — and its whole `process()` was seven reads at `[0]`
and a `fill()`, so anything routed through it was decimated to one value per render
quantum. That included the vision document's own headline example,
`Param(ac, { input: 1, mod: lfo })`.

It also included every instrument's note timing. All eleven drum voices build their
trigger inlet from a `Param` and `MonoSynth` builds its gate from one, so a gate edge was
quantised here — up to 2.9 ms late at 44.1 kHz, by a different amount for every event —
before it reached an envelope that could already read a-rate. Two triggers inside one
block were one trigger. `scripts/_gate.ts` promises the gate contract is "invariant under
`Param`"; it was invariant in value and not in time, and now it is both.

**Non-breaking, and existing patches keep their cost.** k-rate → a-rate widens what a
caller can do; it cannot invalidate a patch. With nothing connected, or with a constant
connected — which Chrome also delivers as a single value — the `fill()` fast path still
runs, and a test asserts it does rather than assuming it.

`gain`, `offset`, `min` and `max` stay k-rate: they are coefficients, read once per
block, and sweeping `gain` still produces block steps by design. The VCA-shaped patch
that would want otherwise is what the native `GainNode` already is. `scale` stays k-rate
and structural. Every one of the seven now carries its reason in `params.ts`.
