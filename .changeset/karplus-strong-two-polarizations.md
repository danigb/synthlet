---
"@synthlet/karplus-strong": minor
---

`detune` and `polarization`: a second string loop, and with it the two things
Karjalainen, Välimäki and Tolonen say separate a plucked string from a
"synthesizer-like" tone — **beating**, and a **two-stage decay**.

A real string vibrates in two planes at once. They see different bridge
impedances, so — Järveläinen and Karjalainen 2002, §2 — *"the fast decaying but
louder 'prompt sound' is followed by the more sustained 'aftersound'"*, and the
same unequal impedance makes the two planes slightly different in pitch, which is
heard as beating.

```ts
KarplusStrong(ac, { frequency: 220, decay: 2, polarization: 0.3 }); // a real string
```

**`polarization`** (0–1, default 0) is the second component's amplitude relative
to the first, so it *is* the level difference the listening test measured
thresholds against: `-20·log10(polarization)` dB. Their two findings land on the
knob at 0.45 (7 dB, where reduction starts being detected) and 0.126 (18 dB,
beyond which "beatings remained inaudible"). Measured modulation depth of the
fundamental: **0.99 / 0.55 / 0.31 / 0.16 / 0.08** at 0 / 6.9 / 12 / 18 / 24 dB.

It is one knob for both effects on purpose. §6: *"If the polarization components
are made equally strong, the two-stage decay cannot be implemented at all"* — so
a control scheme with separate mix and decay-difference knobs would be offering a
setting that does not exist. Measured early-to-late decay-rate ratio: **1.18** for
one string, **2.67** at 12 dB apart, **2.28** at equal strength.

**`detune`** (0–1, default 0.5) mistunes the second loop by up to 10 cents —
cents rather than Hz because the mechanism is a difference in effective *length*,
so the beat rate follows the pitch as a real string's does. Measured beat rate
against the frequency difference asked for: 0.633 / 1.266 Hz at 220 Hz and
1.264 / 2.546 at 440, worst error **0.7%**. At `detune: 0` the two loops are in
tune and what is left is a pure two-stage decay — Karjalainen et al.'s Fig. 10(b).

The weak polarization rings **three times** as long as the strong one, which is
not a free parameter: Järveläinen and Karjalainen's Fig. 7 tested `τ_h = 0.30 s`
against `τ_v = 0.54 … 1.7 s`, and three is inside that. So **the note outlasts
`decay`** in dual mode — 2.3× at 12 dB apart, 2.7× at equal strength, both
measured within 7% of the two-exponential model. `decay` is the prompt sound's
time, which is the component it is applied to.

Both polarizations are the **whole** string — the same damping filter, Lagrange
read, dispersion cascade and probabilistic variants — and both are excited by the
**same** burst, following Laurson et al. 2001: *"They feed both from the same
excitation."*

Three properties worth stating.

- **`polarization: 0` is free and bit-identical** to the previous release. The
  second delay line, the shared burst buffer and the mix pass are allocated on the
  first block that asks for them, so a patch that never turns the knob never pays
  the 8.8 KB. 20.0 ns/sample at the default, 44.4 with the second polarization,
  68.2 with dispersion as well — 0.09% to 0.30% of one core at 44.1 kHz.
- **It is not a volume knob.** The mix is a convex combination, `(first +
  p·second)/(1 + p)`, so the pair sits at one string's level rather than summing
  to two — and can never exceed the louder of them, which is also the amplitude
  bound.
- **The pitch does not move.** At `detune: 0` the pair plays within 5 cents at
  110, 440 and 1760 Hz, as one string does.
