---
"synthlet": minor
---

Render offline: `BaseAudioContext` everywhere, and a test that proves a render.

`registerAllWorklets`, `registerMonoSynth` and `registerDrums` now take any
`BaseAudioContext` - as a type parameter, so `registerAllWorklets(new
AudioContext())` still resolves to an `AudioContext` rather than to something
without `resume()`. `MonoSynth`, the drums, and the `Gain`, `Oscillator`,
`BiquadFilter` and `ConstantSource` helpers in `waa.ts` follow.

`src/offline.test.ts` is the proof, and it runs in CI: an `OfflineAudioContext`
registers all 24 worklets, renders a `PolyblepOscillator` through an `AdsrAmp`
and renders a whole `MonoSynth`, and the rendered envelope is asserted by RMS in
10 ms windows. It also asserts that two renders of one graph are **sample
identical** - the determinism a rendered buffer has to have before it can be
used as a reference. The harness is `node-web-audio-api` behind
`scripts/offline-audio-env.mjs`, a jest environment; the suite's topology mock
is untouched and still covers everything else.

The guide gains an "Offline rendering" section.
