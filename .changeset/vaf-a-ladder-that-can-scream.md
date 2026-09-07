---
"@synthlet/virtual-analog-filter": major
---

The two Moog ladders self-oscillate.

**Breaking: `resonance` changes meaning on `MOOG_LADDER` and
`MOOG_HALF_LADDER`.**

The README sold "the nonlinearity and the resonance behaviour that make it
recognisable". Five of the nine models had no nonlinearity of any kind,
including the flagship: `moog.ts` was Zavalishin's _linear_ TPT ladder, and
`vaeffects.lib` says "no nonlinearities" in its own doc comment. So nothing
self-oscillated. `MOOG_LADDER` at `resonance: 1.0` held a constant amplitude
because `k = 4·resonance` landed on exactly 4.0, the analytic threshold — a
marginally stable linear resonator ringing at whatever the last impulse left
it, one rounding error either side of silence and divergence. You could not
make this module scream, which is the one thing people reach for a ladder
filter to do.

Both ladders now have a saturating feedback path, and the delay-free loop that
creates is resolved rather than delayed away. Measured at 48 kHz with
`frequency: 1000`: silence below `resonance: 0.95`, and above it a stable
oscillation that settles at 0.96 (`MOOG_LADDER`) and 0.58
(`MOOG_HALF_LADDER`) at `resonance: 1.0`, at a frequency that tracks
`frequency`.

`resonance` is rescaled so the threshold sits at 0.95 rather than at the very
top, which is why this is breaking: the same `resonance` value now gives about
5 % more feedback than it did. Below the saturation knee the filter is
bit-identically the one it was — the solver's initial estimate _is_ the linear
closed form it replaces — so every corner, skirt, sample-rate and passband
measurement is unchanged.

**What this is, and is not.** The saturator is Huovilainen's differential pair
(_Non-linear Digital Implementation of the Moog Ladder Filter_, DAFx 2004,
eq. 1–6): the two transistors' collector currents differ by a `tanh`, and that
sits where the input meets the feedback. The loop it closes is resolved by the
discrete-time method from Chowdhury's _A Review of Methods for Resolving
Delay-Free Loops_ (§4), which his conclusion recommends for purely digital
systems, with four Newton–Raphson iterations from the linear solution as the
initial estimate (worst-case residual 9.0e-11).

Huovilainen's four _per-stage_ `tanh`s are deliberately not included. They
shape harmonics rather than create the oscillation, they would turn a scalar
solve into a four-dimensional one, and Huovilainen is explicit that they need
oversampling — which this release does not have.

**Two numbers, stated rather than hidden:**

- **Aliasing.** Unit-amplitude sine, 48 kHz, no oversampling: the worst
  non-harmonic partial is −179 dB at `drive: 1` and a 1 kHz probe, −41 dB at a
  3.7 kHz probe with `drive: 10`, and −30 dB at 7.9 kHz with `drive: 10` and
  `resonance: 0.9`. Huovilainen requires oversampling and this release does not
  do it; that is the next ticket, and these are its baseline.
- **Cost.** `MOOG_LADDER` is **11× more expensive** than it was: 13.6 → 151 ns
  a sample, i.e. 0.065 % → 0.73 % of realtime for one voice at 48 kHz. The
  other seven models are unchanged. If you want a cheap filter,
  `@synthlet/state-variable-filter` is the cheap filter.

`KORG35_*` stays linear, by decision rather than by omission — inventing
saturation behaviour for a circuit the literature does not describe would be
modelling by vibe. `DIODE_LADDER` and `OBERHEIM_*` already have a saturator,
which `drive` reaches.

`src/moog.ts` and `src/moog-half.ts` therefore stop being generated files.
Their linear TPT cores are still `ve.moogLadder` and `ve.moogHalfLadder` and
are still attributed; the nonlinearity and the solver are ours, transcribed
from two papers rather than from anyone's code. `THIRD-PARTY-LICENSES.md` and
`dsp/compile.txt` both say so.
