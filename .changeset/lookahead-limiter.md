---
"@synthlet/lookahead-limiter": minor
---

`LookaheadLimiter` is rewritten from scratch as a **true-peak brickwall
limiter**, and now has parameters:

```ts
const limiter = LookaheadLimiter(ac, {
  threshold: -1, // dBTP ceiling
  release: 168, // ms, 10-90% recovery
  gain: 6, // dB of drive, applied *before* the detector
  lookahead: 2, // ms - construction-time, sizes the delay line
});

limiter.threshold.value = -3; // an AudioParam, automatable
limiter.latencySamples; // 102 at 48 kHz
```

- **`threshold`, `release` and `gain` are real `AudioParam`s.** The package
  previously exposed none: all three were read from `processorOptions` in the
  constructor and fixed for the node's lifetime.
- **Peaks are measured on a 4× oversampled reconstruction**, so inter-sample
  peaks - a signal that never exceeds full scale sample-by-sample but overshoots
  between samples - are caught. Below the threshold the output is a bit-exact
  copy of the input, delayed by `latencySamples`.
- **`gain` is a drive, not a makeup gain**: it is applied before both the
  detector and the delay line. A makeup gain after the ceiling is enforced would
  break the guarantee.
- **`release` is the 10-90% recovery span**, not a time constant.
- **The node reports `latencySamples` and `latencyTime`** - the lookahead window
  plus the detector's group delay. Web Audio has no automatic delay
  compensation, so a parallel dry path must be delayed by hand.
- **Output follows its input's channel count** instead of being forced to
  stereo, and one gain drives every channel so the stereo image cannot wander.

Breaking: `lookahead` moved from `processorOptions` to a construction option,
and the `thresholdDb` / `lookAheadSeconds` / `releaseSeconds` `processorOptions`
are gone. The package has never been published, so nobody is passing them.

The previous implementation cited `DanielRudrich/SimpleCompressor` (GPL-3.0) and
has been removed in full. The replacement is re-derived from published algorithm
descriptions - Hämäläinen, DAFx-02 §3.5, and ITU-R BS.1770-4 Annex 2 - with the
chain recorded in `THIRD-PARTY-LICENSES.md` and in the header of `src/dsp.ts`.
