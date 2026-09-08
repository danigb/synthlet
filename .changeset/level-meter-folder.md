---
"@synthlet/level-meter": minor
---

**The numbers this meter reports have changed.** If you were reading it, you
were reading a signal that was 20 dB low on transients and falling forty times
too fast — and differently at every sample rate. Everything below follows from
fixing that.

Read the [level meter page](https://danigb.github.io/synthlet/docs/level-meter)
for the API and the
[metering and loudness guide](https://danigb.github.io/synthlet/docs/metering-and-loudness)
for what to measure and how to hit a delivery target. Both now have a demo that
runs, which they could not before: the meter no longer needs a cross-origin
isolated page.

### What moved

| Before                                           | Now                                                         |
| ------------------------------------------------ | ----------------------------------------------------------- |
| one one-pole for attack and release              | instant attack, 8.7 dB/s release, hold, clip latch          |
| 315 / 343 / 686 dB/s at 44.1 / 48 / 96 kHz       | 8.7 dB/s at all three                                       |
| a full-scale transient read −20 dB               | it reads 0 dB                                               |
| `new SharedArrayBuffer` in the factory, always   | feature-detected; `postMessage` when it is unavailable      |
| `getPeaks()`, and you supplied the channel count | `getLevels()`, which knows it                               |
| peak only                                        | peak, hold, clip, RMS; true peak and LUFS on request        |
| in the signal path                               | `LevelMeter.tap(node)`, one line, nothing broken            |
| pull, once per frame, by hand                    | `subscribe`, at most once per frame, or the canvas          |
| realtime only                                    | `analyze()` over a buffer, from `@synthlet/level-meter/dsp` |

### Migrating

- **`getPeaks()` is deprecated and still works.** It returns the same live
  `Float32Array` of linear peaks it always did. It goes in the next release;
  `getLevels()` is the replacement and it answers in dB with the channel count
  attached.
- **`registerLevelMeterWorklet` is no longer needed** for `LevelMeter` or
  `LevelMeter.tap`. It is still exported and still works.
- **A meter you inserted in the path keeps working.** `LevelMeter(context)` is
  now a native `GainNode` with the worklet tapped off it, so the audio no longer
  waits for the worklet to register and a processor that throws cannot silence
  what it was watching.
- **If you were tuning around the old ballistics**, stop: `releaseDbPerSecond`,
  `holdMs`, `clipHoldMs`, `clipThreshold` and `rmsMs` are construction options
  now, and the defaults are K-Meter's rather than an accident.
- **Nothing needs COOP or COEP headers.** If you set them for this package, you
  can stop.

`truePeak` and `loudness` are opt-in, in that order of cost: true peak is about
10.6× everything else in the meter put together, loudness is cheap. Both read
`NaN` until you ask for them, because "not measured" and "silent" are different
answers.
