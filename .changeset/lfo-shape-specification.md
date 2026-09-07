---
"@synthlet/lfo": minor
---

Give every LFO shape a specification, and assert it.

**Behaviour change.** `Triangle`, `RampUp`, `RampDown`, `ExpRampUp`,
`ExpRampDown` and `ExpTriangle` are realigned so that phase 0 is zero-and-rising
for every continuous shape, as `Sine` already was. A modulation source's zero
point should be no modulation: once the LFO can be reset, a `Triangle` vibrato
that started at −1 would begin every note at maximum downward pitch deviation.
`Square` and `Impulse` keep their phase-0 value and are documented as the
exceptions. A free-running LFO hears this once, as a different first quarter
cycle; after that the two versions are the same signal at a fixed offset.

**Bug fix.** `ExpTriangle` was phase-inverted against `Triangle` — it peaked
where the triangle troughed, and had since the package was written. The three
`Exp*` shapes are now their linear partners bent inward: same zeros, same peaks,
same sign everywhere.

`Square` switches high on `[0, ½)` and low on `[½, 1)`, so its duty is exactly
half.

`dsp.ts` now carries the shape table as a specification, `packages/lfo/README.md`
and the docs page repeat it, and `dsp.test.ts` asserts every row of it —
declared value at each quarter phase, ±1 excursion, symmetry, monotonicity and
zero mean, across five sample rates and three rates.
