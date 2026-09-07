---
"@synthlet/state-variable-filter": patch
---

Honour `DISPOSE`, so a disposed `Svf` actually stops.

The processor listened for a port message called `"STOP"`. Nothing in the repository has
ever sent an `Svf` that message: `dispose()` posts `{ type: "DISPOSE" }`, which is the
vocabulary every other one of the 23 packages handles. So `this.r` stayed `true`,
`process()` returned `true` forever, and a disposed node's processor kept being scheduled
for the lifetime of the `AudioContext`.

Almost certainly a survivor of an earlier message vocabulary: the shared half of the
contract lives in `_worklet.ts`, which is copied wholesale, so it was updated everywhere at
once and this one processor was left behind. `MonoSynth` builds one of these per voice, so
the leak is unbounded.
