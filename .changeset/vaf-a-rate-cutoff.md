---
"@synthlet/virtual-analog-filter": patch
---

**`frequency`, `detune` and `resonance` are now `a-rate`**, so an envelope or an LFO on
the cutoff produces a smooth sweep instead of a 344 Hz staircase.

Filter cutoff is the canonical modulation target in subtractive synthesis. This library
has two filters and they gave opposite answers: `state-variable-filter` has declared its
cutoff a-rate from the start, so `MonoSynth` gets a smooth sweep through `Svf` — and the
same patch built on `VirtualAnalogFilter` got one cutoff value per render quantum. There
was no stated reason for the difference, and no cost reason either: with a node connected,
the modulator is rendered and summed whether or not the samples are read.

A 200 Hz modulator is now filter FM rather than aliasing. At one value per 128 samples the
cutoff was sampled at 344.5 Hz, so anything above 172 Hz folded — a 200 Hz modulator
arrived as 144 Hz.

**Unautomated patches cost nothing extra, and slightly less.** The nine models compute
their coefficients — a `Math.tan`, and in the Korg 35 a `Math.pow` too — at the top of
`process()`, so the filter renders the block in _runs of constant coefficients_: one run
whenever nothing is automated, which is exactly what it did before, and change detection
now skips even the coefficient recompute when the values have not moved. A genuinely
per-sample sweep is 128 runs, which is the per-sample recompute the smooth sweep needs.

Each channel keeps its own change-detection state alongside its own filter bank, so a
stereo sweep updates both channels rather than only the first.

Internal: `Filter.process` takes a `from`/`to` range, so rendering a run needs no
`subarray` and allocates nothing on the audio thread. The generated Faust bodies are
otherwise untouched — the loop bounds are the whole edit.

`type` stays `k-rate`. It is an index into a bank of nine circuits, and switching it
mid-block is a discontinuity rather than a feature.
