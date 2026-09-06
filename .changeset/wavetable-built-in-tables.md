---
"@synthlet/wavetable-oscillator": minor
---

Build wavetables from harmonic spectra, and ship a built-in table.

`WavetableOscillator(ac)` now makes a sound the moment it is constructed. It was
the only generator in the catalogue that did not: `$wavetable` started empty and
stayed empty until a fetch against `smpldsnds.github.io` resolved, so the node
was silent offline, under a strict CSP, and in any test without a network stub.

A new main-thread `wavetable-builder` sums harmonic magnitudes into planes:

```ts
const osc = WavetableOscillator(ac); // audible immediately
osc.setHarmonics([[1], [1, 0.5, 0.25]]); // sine morphing into a 3-harmonic tone
```

`planes[p][0]` is the fundamental of plane `p` — unlike Web Audio's
`PeriodicWave`, whose index 0 is DC. There is no DC term. `buildPlane`,
`buildWavetable`, `builtInHarmonics`, `shapeHarmonics`, `normalizePeak`,
`canonicalPhase`, `defaultWavetable` and `BUILT_IN_SHAPES` are exported for use
without a node.

Every plane is built at one **canonical phase** — 0 on odd harmonics, π on even
ones, per Serra, Rubine & Dannenberg (JAES 38(3) 1990 §3.4.3). A linear crossfade
between two planes equals a linear crossfade of their harmonic magnitudes only
while corresponding harmonics share a phase (their Eq. 7); when they do not, the
morph dips in level and is heard as a frequency shift. Generated planes now
satisfy that constraint by construction, measured to 0.004 % across the built-in
set. The alternation also moves a sawtooth's discontinuity off the loop seam:
1.0000 → 0.0067 of full scale at 256 samples.

The default table is four planes — sine, triangle, sawtooth, square — generated
from harmonic rules rather than shipped as data, and shared between nodes.
`loadWavetable` is unchanged and still works; it is no longer the only way to get
a sound.
