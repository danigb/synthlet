---
"@synthlet/polyblep-oscillator": minor
---

Hard sync, and the phase it resets to.

A new a-rate `sync` parameter and a new `phase` construction option:

```ts
const master = PolyblepOscillator(ac, { frequency: 110 });
const slave = PolyblepOscillator(ac, { frequency: 660, sync: master });
```

**The reset is sub-sample and band-limited.** A rising edge on `sync` — the
transition from non-positive to positive, synthlet's one gate contract — is not
an assignment to the phase. It is a step _and_ a slope change at an interpolated
instant, scheduled through the same primitive as every wrap and every pulse
edge, so it is corrected rather than spliced. The sample after the edge is
`naive(phase + d·inc) + height·blepResidual4(d)` to within **2.0e-3** at 440 Hz
and 4.6e-3 at 1000 Hz. Read the same sample against `blepResidual4(0)` — which
is what an integer-sample reset produces — and the error grows monotonically
with the crossing fraction, 0.039 to 0.403. That difference is the feature.

**The triangle ships with the others.** A hard-synced triangle is not
C¹-continuous: the reset produces a corner as well as a step, which is why the
audit expected sync for the saw and square first and triangle-sync as separate
work. The scheduler takes a step height and a slope change in the same call, so
it is the same line of code. Predicting the sample with the BLAMP term is four
times closer than predicting it without, against a slope change of 0.36 to 0.88
per sample.

**A reset is two sub-advances, not one.** The phase runs to the reset instant,
jumps, and runs on to the sample, so a wrap or a pulse edge on either side of
the reset is corrected exactly once and at its own age. Advancing once and
resetting afterwards — the obvious reading — schedules crossings the reset
pre-empted and never walks the ones it really makes: measured over 432 settings
that peaks at **2.6190** against **1.0037** for the version shipped.

**Bounded where it is driven hardest.** A reset arriving every 1–32 samples
peaks at 1.1667 over 672 settings and a gate driven by white noise at 1.0875 —
unlike `width`, whose flips can bunch inside the kernel's support, a reset's
step height shrinks as the resets get closer together. A master at 333.7 Hz
holds 1.0027 across 288 settings, and `sync` held at −1, 0, 1, NaN or Infinity
is finite for every waveform at every declared frequency and width.

**Against an uncorrected reset**, measured as alias SNR with a non-integer
master period: **+0.94 dB to +23.82 dB** better than assigning the phase at the
sample boundary, the margin growing with the slave/master ratio, and +0.85 to
+13.71 dB better than the same phase trajectory with only the correction
missing.

**`phase` is a construction option, not an AudioParam** — a one-time initial
condition, and where `sync` restarts. A number is taken modulo 1; `"random"`
draws once per instance, which is what stops three detuned oscillators stacked
into a supersaw starting phase-locked and combing through the attack.

**Nothing that does not use `sync` changes.** A render with no gate, and a
render with a gate that never goes positive, are both bit-for-bit what the
previous version produced — verified across **3584** fingerprinted renders
covering two sample rates, every waveform, sixteen frequencies including
negatives and `-0`, seven widths, two block sizes and both k-rate and a-rate
parameter arrays.
