---
"@synthlet/lfo": minor
---

Give every `Lfo` its own generator state.

`RandSampleHold` and `Impulse` were built once at module scope, and an
`AudioWorkletGlobalScope` evaluates a processor module once — so every `Lfo` of
those types in an `AudioContext` shared one variable. Measured: a brand-new
`Impulse` node emitted nothing at all, because an older node's render had
consumed the shared flag; a fresh sample-and-hold opened on an older node's
value, and was re-rolled by that node's phase wraps rather than by its own.

Both generators are now constructed per instance. The nine stateless shapes are
unchanged, bit for bit.

**Behaviour change** for a patch with two `RandSampleHold` LFOs: they used to be
identical and now diverge, which is what every other generator in the library
promises. If you want one random source feeding several destinations, that is a
`Noise` into a sample-and-hold, not two LFOs.
