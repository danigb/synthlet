---
"@synthlet/karplus-strong": minor
---

`tension`: the initial pitch glide. A hard pluck stretches the string, which
raises its tension, which raises its pitch — and it all slides back down as the
vibration decays. It is the sound of a snapped bass string, an electric guitar
dug into, a tom-tom. Until now this module's pitch was constant from the first
sample to the last at every dynamic level.

```ts
KarplusStrong(ac, { frequency: 110, decay: 3, level: 1, tension: 0.5 }); // it bends
```

The glide is driven by the pluck's **energy**, following Avanzini, Marogna and
Bank 2012 — *"the short-time average of the tension variation, which is
responsible for pitch glides, is approximately proportional to the system
energy"* — and specifically their §V-B energy storage model, which applies
exactly when the excitation is an initial state rather than a continuous driver:
the burst's energy seeds it and the loop's own dissipation decays it. Not
Tolonen et al.'s elongation sum, which costs "hundreds of addition and
multiplication operations per sampling interval" and gets worse as the pitch
falls.

**The glide scales with `level²`**, so a soft pluck glides less than a hard one —
the entire physical point. Measured at 349 Hz, `tension: 0.5`: 0.9 / 2.6 / 5.3 /
8.9 Hz at `level` 0.25 / 0.5 / 0.75 / 1.

**The taper is ours, but every point on it is a measured number.** Järveläinen
and Välimäki 2001 measured detection thresholds of 3.1 / 4.4 / 5.4 / 11.7 Hz at
116.5 / 196 / 349 / 659 Hz. At a full-scale pluck this module glides:

| `tension` | 116.5 Hz | 196 Hz | 349 Hz | 659 Hz |
| --------- | -------- | ------ | ------ | ------ |
| threshold | 3.1      | 4.4    | 5.4    | 11.7   |
| 0.1       | 0.8      | 1.3    | 2.2    | 2.7    |
| 0.5       | 2.9      | 5.6    | 8.9    | 15.7   |
| 1         | 6.0      | 10.5   | 19.1   | 31.6   |

so mid-range sits on the thresholds and the top clears them by 2–3×. Their Fig. 1
is a recorded electric guitar gliding 499 → 496 Hz, "approximately 3 Hz"; this
module measures **2.75 Hz** there at `tension: 0.1`.

**The contour needed no tuning.** Järveläinen and Välimäki built their stimuli
with "the time constant of the frequency descent … 50% of the overall time
constant of amplitude decay". A descent with half the amplitude's time constant
is a descent proportional to amplitude *squared* — which is energy. The two
papers are the same statement, and implementing either gives the other.

**Default 0, deliberately.** Their own conclusion is that "any pitch glide weaker
than the given threshold remains inaudible for most listeners and could be left
unimplemented in digital sound synthesis", and at the shipped `level` a
physically-scaled glide sits near that threshold. So it ships as an effect a
patch asks for: `tension: 0` is bit-identical to the previous release and does
not even accumulate the burst's energy. With it on, +4 ns/sample averaged over a
`decay: 1` note and +9 over a `decay: 5` one — most of which is the fractional
delay's interpolator recomputing its kernel, not the energy model, which is one
multiply.

Three things it does not do.

- **It does not move the settled pitch.** The energy decays to zero and the
  modulation with it, so the string ends where `frequency` asked: within 0.41
  cents at 110, 440 and 1760 Hz at every `tension`.
- **It cannot destabilise the loop.** The energy is open loop — seeded by the
  pluck, decayed by `rho`, never touched by the loop's own signal — so there is
  no path by which the delay drives its own modulation, and nothing feeds energy
  into the string. Asserted over 60 s renders with every loop parameter at a
  corner at once.
- **It is a pitch glide, not a full tension-modulation model.** The nonlinearity
  also couples harmonic modes (Tolonen et al. 2000 name both effects); the
  quasi-static approximation this rests on reproduces only the first.
