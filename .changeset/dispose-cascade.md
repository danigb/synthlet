---
"synthlet": patch
---

Fix `dispose()` on compounds (`MonoSynth`, all drums) stranding their internal
graph. `disposable()` replaced any `dispose` the node already had instead of
composing with it, so wrapping a chain in `withParams` discarded the cascading
teardown and only the top-level control params were disposed — the oscillators,
filters and envelopes kept processing. `ConnSerial` and `ConnMixInto` had the
same problem. Nodes declared in `s.synth({ modules })` are now disposed with the
compound too.
