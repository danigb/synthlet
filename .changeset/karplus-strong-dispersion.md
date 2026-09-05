---
"@synthlet/karplus-strong": minor
---

`stiffness` (0-1, default 0): dispersion, the last of the three blocks Bank and
Välimäki factor the string loop into - `Hl(z) = Hloss(z)·Hdisp(z)·Hfd(z)` - and
the one this package never had. Every partial it produced was an exact integer
multiple of the fundamental, because the loop was a pure delay.

Real strings are stiff. The bending term in the restoring force makes high
partials travel faster, so partial `k` sits at `k·f0·sqrt(1 + B·k²)` rather than
at `k·f0`, and that stretch is most of what separates a piano, a clavinet or a
steel-string from a synthetic comb.

```ts
KarplusStrong(ac, { frequency: 110, decay: 3, stiffness: 1 }); // clangorous
```

Measured on the 110 Hz string, cents sharp of the harmonic series:

| stiffness | 4th partial | 8th | 16th |
| --------- | ----------- | --- | ---- |
| 0         | 0.0         | 0.0 | 0.0  |
| 0.25      | 0.1         | 1.0 | 8.1  |
| 0.5       | 0.3         | 3.4 | 19.6 |
| 1         | 6.6         | 38.6| 91.8 |

The filter is **Rauhala and Välimäki's tunable dispersion filter** (IEEE Signal
Processing Letters 13(5), 2006): a second-order Thiran allpass whose
coefficients come from the fundamental and the inharmonicity coefficient `B` in
closed form, so it is redesigned every block and the stiffness **tracks the
pitch** instead of being baked in at build time. One section, chosen by
measurement rather than preference - their Table I fits the parameterization per
cascade length, and their four-section design stops dispersing above about a
kilohertz where one section runs to 2.8 kHz for a quarter of the cost.

**The `stiffness → B` taper is ours and unsourced**: `B = 1e-5 · 100^stiffness`,
an exponential across the two decades of inharmonicity coefficient the paper
searched for pianos. No paper prescribes a knob mapping; the filter is theirs,
the taper is a product decision.

Three things it deliberately does not do.

- **It does not change the pitch.** An allpass has phase delay and the loop
  gives back exactly what it takes, computed at the fundamental in closed form.
  Measured spread of the fundamental across `stiffness: 0…1` is **0.004 cents**
  at 110, 440 and 1760 Hz, and `frequency.maxValue` is unchanged.
- **It does not change the decay.** An allpass has unity magnitude at every
  frequency, so `decay` and `brightness` keep sole ownership of it: t₆₀ measures
  0.851 / 0.861 / 0.840 s at stiffness 0 / 0.5 / 1 at 110 Hz.
- **It costs nothing at 0.** The default render is bit-identical to the previous
  release. Engaged, it is 20 → 34 ns per sample, 0.09% → 0.15% of one core.

It is **not** `stretch`, and `stretch` is not it: that lengthens high-partial
decay, this moves partial frequencies. Both ship, and they compose.
