# @synthlet/polyblep-oscillator

> An Oscillator module implemented with PolyBLEP algorithm for [synthlet](https://github.com/danigb/synthlet)

An oscillator implemented using the PolyBLEP (Polynomial Band-limited Step Functions -Valimaki et. al 2010) algorithm.

```js
import {} from "@synthlet/polyblep-oscillator";
```

## Waveforms and phase

`type` selects a waveform, in brightness order:

| `PolyblepOscillatorType` | value       | naive shape                                 |
| ------------------------ | ----------- | ------------------------------------------- |
| `Sine`                   | 0           | `sin(2π · phase)`                           |
| `Triangle`               | 1           | minimum at phase 0, maximum at half a cycle |
| `Sawtooth`               | 2 (default) | `2 · phase − 1`                             |
| `Square`                 | 3           | `+1` for the first half of the cycle        |

**Phase 0 is the step for the sawtooth and the square, and the triangle's
minimum.** That is the convention the whole package is built on rather than an
accident of the implementation: it is what lets one `width` parameter mean pulse
width on the square and peak position on the triangle, because in both families
the second discontinuity sits at `width`.

The square is `+1` until `width`, matching the Web Audio spec's
`OscillatorNode`. It used to be `-1`, so a patch that mixes this oscillator with
a native one, or that feeds a rectifier or a wave shaper, will sound different.

`frequency`, `detune` and `width` are **a-rate**, so all three take an
audio-rate signal and are read per sample. `type` is k-rate; changing it
mid-note is band-limited like any other discontinuity, so it does not click.

## Width

`width` (0…1, default 0.5) means two related things, and the sine and the
sawtooth ignore both:

| `type`     | `width` is        | at 0.5               | towards 0 / 1                     |
| ---------- | ----------------- | -------------------- | --------------------------------- |
| `Triangle` | the peak position | a symmetric triangle | a rising or falling ramp          |
| `Square`   | the pulse width   | a square wave        | a narrow pulse of either polarity |

There is no separate "skewed sawtooth": it is the triangle at `width → 1`, so
the morph is already reachable and a second spelling would only be another
branch.

**A pulse wave has a real DC component of `2 · width − 1`.** That is correct
behaviour and not something to filter out — a 10% pulse sits at −0.8 and swings
to +1, which is what makes pulse-width modulation move the way it does. If a
patch needs it removed, remove it downstream.

The DSP clamps `width` to `[2·|increment|, 1 − 2·|increment|]` every sample, so
it never quite reaches 0 or 1. Two samples is the band-limiting kernel's
support, and closer than that the two discontinuities' corrections overlap; on
the triangle the same bound is what keeps the corner finite as the short ramp
gets short. The declared range is still `0…1`, because that is the range a UI
slider should offer, and the DSP is total across it. In practice the clamp only
bites in the top octaves: at 440 Hz it allows a 2% pulse, at 4 kHz an 18% one.

## Latency

The output is delayed by **two samples**, about 45 µs at 44.1 kHz. It is the
only latency in synthlet, and it is deliberate.

The band-limiting correction spans ±2 samples around a discontinuity, so it has
to be written into samples that have already been computed. The alternative is
to predict where the discontinuity will land from the increment at the moment it
is detected — which is what the package used to do, and what places the
correction slightly wrong as soon as the frequency is moving quickly. Buying two
samples of delay buys correct placement under audio-rate FM, and it is constant,
so it never smears.

## Install

```bash
npm i @synthlet/polyblep-oscillator
```

## References

- https://paulbatchelor.github.io/sndkit/blep/
- https://www.martin-finke.de/articles/audio-plugins-018-polyblep-oscillator/
- https://www.metafunction.co.uk/post/all-about-digital-oscillators-part-2-blits-bleps
- https://github.com/cmajor-lang/cmajor/blob/main/standard_library/std_library_oscillators.cmajor
