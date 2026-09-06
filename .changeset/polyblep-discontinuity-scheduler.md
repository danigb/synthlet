---
"@synthlet/polyblep-oscillator": minor
---

Rewrite the oscillator on a discontinuity scheduler: 4-point band-limiting, a
direct-corrected triangle, a-rate `frequency` and `detune`, and the sine back.

**One primitive replaces three hand-written waveform branches.** Each branch
used to predict where its own discontinuity would fall and place a correction
from the current increment. There is now a phase accumulator, an edge detector
and one `addDiscontinuity(d, stepHeight, slopeChange)` writing band-limiting
residuals backwards into a four-slot pending buffer carried across render
quanta. Every waveform is a naive function plus a list of where its
discontinuities are.

**The correction order goes from 2-point to 4-point.** Measured alias SNR at
44.1 kHz, in dB, at 440 / 1000 / 2000 / 4000 / 8000 Hz: sawtooth 35.4 / 32.0 /
29.5 / 24.7 / 18.3 becomes **45.5 / 42.3 / 40.1 / 34.5 / 26.8**, and square
36.9 / 33.3 / 33.0 / 30.4 / 18.1 becomes **46.8 / 43.2 / 45.1 / 43.8 / 26.6**.
In the audit's terms, the oscillator is perceptually alias-free below 7845 Hz
rather than below 2135 Hz — the difference between aliasing audibly in the top
octave of a piano and not.

**The triangle is corrected directly and is no longer an integrated square.**
The integrator, its `4 * increment` gain and the DC blocker behind it are all
deleted together. That blocker had a −3 dB corner at 63.4 Hz, inside the musical
range: a 20 Hz triangle peaked at **0.201** of full scale, 55 Hz at 0.524,
110 Hz at 0.795. It now peaks at **0.999 / 0.998 / 0.995**. Its alias SNR at
440 Hz goes from 65.7 dB to **80.7 dB**. And because there is no recursive state
left, the cold-start transient goes too: a render from silence used to peak at
1.777 while the integrator settled, and now peaks at exactly 1.000.

**`frequency` and `detune` are a-rate.** Both are read per sample instead of
once per 128-frame render quantum, so the oscillator does audio-rate FM and
sample-accurate pitch instead of quantising all modulation to 2.9 ms. A held
value costs one comparison per sample and is bit-identical to the k-rate path.

**Two samples of latency, about 45 µs.** The 4-point correction spans ±2 samples
around a discontinuity, so it is written into samples already computed but not
yet emitted. That is what makes the placement exact under fast modulation, where
a predictive correction lands wrong. It is constant and it is the only latency
in the library.

**Breaking changes.** The library is pre-1.0 and this version is unpublished;
nothing is kept behind a flag.

- **`PolyblepOscillatorType` renumbers**, in brightness order:
  `Sine = 0, Triangle = 1, Sawtooth = 2, Square = 3`. It was
  `Sawtooth = 0, Square = 1, Triangle = 2`. The default is still the sawtooth,
  so a patch that never sets `type` is unaffected; a patch that sets it by
  **number** now selects a different waveform, and should use the enum.
- **The square's polarity flips** to `+1` for the first half of the cycle, per
  the Web Audio spec. It was inverted relative to `OscillatorNode`.
- **The sine is restored** (it was deleted a while ago and never replaced) and
  is the cheapest waveform in the file: no discontinuity, so no correction.
- **The triangle's shape and level change**, per the numbers above.
- **`frequency` and `detune` change `automationRate`** from `k-rate` to
  `a-rate`. Reading `descriptors` for the rate is the only thing that can
  notice; `frequency` keeps `minValue: 0`, which `connectParams` requires.
- **A `type` change is now band-limited**, so switching waveform mid-note no
  longer steps the output.

Attribution: the scheduling structure derives from Mutable Instruments' stmlib
(`stages/oscillator.h`, MIT), recorded in `THIRD-PARTY-LICENSES.md`. The
band-limiting polynomials are not stmlib's — they are B-spline residuals derived
by integration, with the derivation and its proofs in `src/_blep.ts` and
`src/blep.test.ts`.
