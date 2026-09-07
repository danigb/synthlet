---
"@synthlet/lfo": patch
---

**`Lfo` now emits a signal instead of one value per render quantum.** Every LFO in the
library was a 344 Hz staircase at 44.1 kHz, whatever it was patched into: `worklet.ts`
built the generator with `createLfo(sampleRate, false)`, and the per-sample
`generateAudioRate` — complete and correct since it was written — was unreachable.

**Patches will sound different.** A 5 Hz sine stepped by up to 9 % of its peak-to-peak
amplitude per step, at the zero crossings, which is the fastest part of the waveform: a
stepped pitch on a frequency parameter, a click train on a gain one. Measured energy at
the render-quantum rate and its first three harmonics drops from 37–49 dB below the
fundamental to 146–158 dB below it, which is the `Float32Array`'s own noise floor.

The block-constant generator was also not merely a decimation of the right signal. It
advanced the phase by a whole block and evaluated `gen(phase, nextPhase)` once, so the
two-endpoint shapes — `RandSampleHold` and `Impulse` — read a block-averaged value; an
`Impulse` LFO emitted a 128-sample pulse rather than one sample.

`createLfo`'s `audioRate` argument stays in place and unexposed, and
`generateControlRate` with it, tested as a documented alternative. `generateAudioRate`'s
loop now hoists its generator, increment and scalars — all fixed for the block, because
every parameter `Lfo` declares is k-rate — which is worth 34 % of the function and leaves
its output bit-identical.

No parameter changed its automation rate.
