---
"@synthlet/lfo": minor
---

`Lfo.frequency` is a-rate.

It read as k-rate on a **cost** argument — the hoisted phase increment is worth
34% of the generator — and `scripts/_worklet.ts` allows exactly two grounds for a
k-rate opt-out, neither of which is a saving. `Clock` sends the caller who wants
an audio-rate tempo to `Lfo`, and until now they arrived at a second
block-quantised parameter.

**Behaviour change**: a `frequency` driven by a modulator used to step once per
render quantum. It now tracks per sample.

**And it costs nothing unless you use it.** A browser hands length 1 both for an
unconnected parameter and for a connected constant, so every patch that does not
modulate the rate keeps the hoisted increment and renders bit-identically.
Measured, the per-sample branch costs 2.3–9.4% (`benchmarks/lfo-rate/`).

`maxValue` stays at 200, now documented rather than merely advertised: above
roughly 20 Hz this stops being a modulation source, and at 200 Hz the naive
discontinuous shapes measure 16–25 dB of alias SNR against 96 dB or better at
100 Hz. That is a range note, not a missing algorithm — at LFO rates the images
fold back onto harmonics, so there is nothing for a band-limiting scheme to
remove. `@synthlet/polyblep-oscillator` is the band-limited answer above 20 Hz.
