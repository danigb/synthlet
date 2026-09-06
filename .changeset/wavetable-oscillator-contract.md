---
"@synthlet/wavetable-oscillator": minor
---

Mirror the oscillator contract: a-rate `frequency`, `detune`, `phase` and
through-zero FM.

**Breaking.** `frequency` is now **a-rate** and **bipolar**, `-20000…20000`,
where it was k-rate and `0…20000`. Connecting a node to it was already linear
FM — `AudioParam` sums its inputs with the intrinsic value — but the modulator
was quantised to one step per render quantum, which aliases above about 172 Hz,
and half-wave rectified at the bottom of the range, which is not a tamer
modulator but a different one. A negative frequency now runs the read pointer
backwards.

New `detune`, a-rate, `-1200…1200` cents, multiplying `frequency`. Measured
accurate to 0.23 cents across its range.

New `phase` **construction option**, `number | "random"`, seeding the read
position. It is not an `AudioParam`: it is a one-time initial condition, and
`"random"` draws once per instance, which is what stops a stack of oscillators
beginning phase-locked and combing through its attack.

```ts
const stack = [-7, 0, 7].map((detune) =>
  WavetableOscillator(ac, { frequency: 220, detune, phase: "random" }),
);
```

Through-zero FM costs one sign here, against a discontinuity scheduler rewritten
around a signed increment in `@synthlet/polyblep-oscillator`: `frequency = -f`
is the exact sample-for-sample time-reverse of `frequency = +f`, and a modulator
sweeping the full range inside one render quantum stays finite, in range and no
rougher than standing still.

The mip level is recomputed per sample when the pitch is a-rate, not once per
block from the block's peak increment — a per-block level is a function of the
block, so the same automation would render differently at 128 and 1024 frames.
The level-jump declick is suppressed while the pitch is a-rate, where it would
otherwise run for 62 % of the samples of a deep FM patch and act as a lowpass on
the sweep; a stepped k-rate pitch still declicks. The alias floors are unmoved:
59.3 / 48.4 / 57.4 / 66.1 / 74.5 / 82.1 dB at 110 / 220 / 440 / 880 / 1760 /
3520 Hz, identical through both paths.
