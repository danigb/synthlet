---
"@synthlet/polyblep-oscillator": minor
---

Add `width`: pulse width on the square, peak position on the triangle.

One a-rate parameter, `0…1`, default `0.5`, meaning two related things. On the
**square** it is the pulse width, which is the staple virtual-analog sound and
has no Web Audio equivalent — `OscillatorNode` offers four fixed shapes and a
`setPeriodicWave` that cannot be swept. On the **triangle** it is the peak
position: symmetric at 0.5, a rising ramp towards 1 and a falling one towards 0,
which is a continuous waveform morph. The sine and the sawtooth ignore it; a
"skewed sawtooth" is the triangle at `width → 1`.

It goes through the same discontinuity scheduler everything else does — moving
`width` moves where the second discontinuity sits, and nothing else changes.

**Measured alias SNR at 44.1 kHz, in dB.** Pulse, DC removed, at 440 / 1000 /
2000 / 4000 / 8000 Hz: a 25% pulse reads 46.4 / 43.7 / 44.7 / 32.3 / 36.8 and a
10% pulse 42.6 / 37.4 / 36.8 / 39.4 / 36.8. A skewed triangle at 440 / 1661 /
4186 Hz reads 79.2 / 60.1 / 48.9 at `width = 0.75` and 65.6 / 59.6 / 53.6 at
0.95, against 56.6 / 38.8 / 26.5 and 44.4 / 28.4 / 13.7 with no corner
correction at all. A pulse's peak is 1.000 at every width and frequency
measured, and its mean is `2 · width - 1` — a pulse wave has real DC, and that
is signal.

**`width` is clamped to `[2·|increment|, 1 - 2·|increment|]` per sample**, so it
cannot quite reach 0 or 1. Two samples is the 4-point kernel's support, so any
closer and the two corrections overlap; on the triangle the same bound is what
keeps the corner finite as the short ramp gets short. The declared range is
still `0…1` — that is the range a slider should offer — and the DSP is total
across it, at every frequency including 0. At 440 Hz the clamp allows a 2%
pulse, at 4 kHz an 18% one.

**`width = 0.5` is bit-identical to the previous release's square and
triangle**, so nothing that does not set it changes.
