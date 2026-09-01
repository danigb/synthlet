---
"@synthlet/param": minor
"synthlet": minor
---

The built-in compounds - `MonoSynth` and the ten drums - are now built on the
same public API you would use: the atomic packages, `connect()`, and
`disposable()`. They used an internal DSL that is being removed.

Three consequences for anyone using them:

- **Six drums no longer leak.** `HiHatDrum`, `CymbalDrum`, `MaracasDrum`,
  `HandclapDrum`, `TomDrum` and `CongaDrum` each built a source - an
  oscillator bank, a noise generator, an impulse - that `dispose()` never
  reached, so it kept running after the drum was disposed. Every compound now
  owns everything it creates, and the test suite checks all eleven.
- **`KickDrum.volume` and `CongaDrum.volume` work.** Both knobs were exposed
  but wired to nothing: the kick had no output stage and the conga's was
  hardcoded to unity gain.
- **All eleven return `Disposable<GainNode> & {…}`.** Every compound now ends
  in an explicit output `Gain`, where `KickDrum` used to end in a
  `ClipAmpWorkletNode` and the drums had several different static types. The
  properties are unchanged: drums expose `trigger`, `tone`, `decay` and
  `volume`; `MonoSynth` adds `osc`, `vibrato`, `filterEnv`, `filter` and `amp`.

`@synthlet/param` gains **`Param.mul(ac, input, gain)`**, a scaled value - the
counterpart of the `Param.inv` that already existed. The drums use it to derive
a shorter decay from the `decay` knob.

`SnareDrum.tone` is exposed but still does nothing; giving it a meaning needs a
DSP decision and is left for a later release.
