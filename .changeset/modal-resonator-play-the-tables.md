---
"@synthlet/modal-resonator": minor
"synthlet": minor
---

`ModalResonator`: a bank of tuned, decaying resonators played from a mode table
— Synth Secrets' kettle drums, bells and cowbells as one node each.

```ts
const strike = Impulse(ac, { trigger: clock.gate });
const timp = ModalResonator(ac, {
  frequency: 150,
  decay: 2,
  modes: ModalResonator.modes.kettleDrum(),
});
strike.connect(timp).connect(ac.destination);
```

Parts 31 to 41 of the book end every chapter with a table of partials — a ratio,
a level and a decay each — and then a struggle to play it on four oscillators
and four contour generators. This plays the table. It is the library's first
module whose main control surface is a **table rather than a parameter**:
`node.setModes([{ ratio, level, decay }, …])`, the `setWavetable` pattern,
taking effect on the next render quantum while the ring in progress continues.
`ModalResonator.modes` holds the tables as pure functions: `harmonic(n)` (the
default), `membrane()` (Part 31), `kettleDrum()` (Part 32, with the book's
levels and decays verbatim), `bell()` (Part 40), `cowbell()` (Part 41) and
`stiffString(B, n)`.

Three parameters, all k-rate: `frequency` (of a ratio-1 mode), `decay` (seconds
for a mode whose table decay is 1 to fall 60 dB — not mode 1, because the kettle
drum's mode 1 is the book's 45 %) and `brightness` (mode n scaled by
`brightness^(n−1)`, the strike-hardness gesture). `frequency` and `decay` are
interpolated across the block. Construction options `maxModes` (default 32) and
`modes`.

**Each mode is a rotating, decaying phasor, not the textbook two-pole
resonator.** The direct form stores two past samples rather than an amplitude,
so its loudness follows roughly `1/√f` when the frequency moves under a ringing
mode. Measured before this was written:

| Case                               | Direct form       | This         |
| ---------------------------------- | ----------------- | ------------ |
| Drum pitch envelope 2000 → 100 Hz  | +12.9 dB          | −0.32 dB     |
| Table swap mid-ring, 3520 → 440 Hz | peak 0.999 → 3.07 | 0.999 → 0.92 |

A rotation preserves length, so pitch changes are pitch changes. The envelope is
exactly `level · rⁿ` at every frequency — no normalisation term — and falls
exactly 60 dB in the decay time. Asserted on the real processor: `rt60` of one
mode at 1.000 s, the kettle drum's peaks at 150, 225, 297 and 366 Hz with its
levels within a dB of 5 : 4 : 3 : 1 and its decays within 5 % of
45 : 73 : 91 : 84, the cowbell as exactly two peaks, `brightness: 0.5` putting
mode 4 at −18 dB, nothing ringing past 0.45 × the sample rate, and a
100 → 200 Hz sweep smoother (by its third difference) than a held tone — while
the same bank with the ramp switched off is 32× rougher.

**Levels are normalised for a strike.** Anything longer than an impulse is
amplified by the resonance: a unit sine held on a mode with `decay: 1` peaks
around 3200 (+70 dB), a 30 ms noise burst into `harmonic(8)` at 2.57. Both
documents say so and the site example puts a `Gain` of 0.05 on its noise
exciter.

**Mono, deliberately**: input channels are summed and the output is one
channel. A body is one object, and a `StereoPannerNode` after it is the idiom.
State flushes to exact zero below −300 dB, so silence is silence rather than a
denormal crawl.

Deliberately not here: `structure` and `position` (Rings' ways of filling a
table without one — a rule is a function that returns a table), an exciter
(`Impulse`, `Noise` and `AdAmp` already are), and chaos (nonlinear mode
coupling, which a linear bank cannot do).
