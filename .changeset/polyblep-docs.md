---
"@synthlet/polyblep-oscillator": patch
---

Write the README, fix the attribution, add the package metadata.

**The README is a real one.** It used to open with a citation matching no paper
("PolyBLEP … Valimaki et. al 2010") and a usage example that was literally
`import {} from "@synthlet/polyblep-oscillator"`. It now has a pasteable example,
a parameter table matching `src/params.ts` cell for cell — `type`, `frequency`,
`detune`, `width`, `sync`, plus `phase` as a construction option — and the four
conventions a user cannot guess: phase 0 sits at the step for the saw and square
and at the triangle's _minimum_; the square is `+1` for the first half of the
cycle, per the Web Audio spec; `frequency = 0` holds and a negative frequency runs
the phase backwards; the output is delayed by two samples, about 45 µs at
44.1 kHz, and nothing else in the library has any latency.

**The quality figures are in it, scoped.** Alias SNR in dB at 44.1 kHz — sawtooth
45.5 / 42.3 / 40.1 / 34.5 / 26.8, square 46.8 / 43.2 / 45.1 / 43.8 / 26.6,
triangle 80.7 / 70.2 / 67.0 / 60.6 / 36.2 at 440 / 1000 / 2000 / 4000 / 8000 Hz —
each asserted by `src/dsp.test.ts` as a floor at the measured value minus 1.5 dB.
The metric is described in one sentence and stated to be this repository's own,
comparable within it and not against published figures. There is deliberately
**no dB number for the comparison against `OscillatorNode`**: nobody has measured
the native node with the same metric, so the docs page runs the two side by side
with a spectrum analyser on each instead.

**The attribution is correct.** The quadratic PolyBLEP residual is credited to
Välimäki & Huovilainen 2007, not to Brandt 2001 — Brandt's paper contains no
polynomial at all and is cited for hard sync and MinBLEP. `THIRD-PARTY-LICENSES.md`
now separates the five papers it cites from the one source it derives from
(stmlib, MIT), states that the residuals in `src/_blep.ts` were derived by
integrating the cardinal B-spline rather than transcribed from any table, and
retires the sndkit credit with its reason: the 2-point correction it described was
deleted by the discontinuity-scheduler rewrite, and The Unlicense owed no notice
in the first place.

**`package.json` gets `repository` (with `directory`) and `homepage`**, pointing
at the docs page.
