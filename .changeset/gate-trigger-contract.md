---
"@synthlet/ad": minor
"@synthlet/adsr": minor
"@synthlet/arp": minor
"@synthlet/impulse": minor
"@synthlet/karplus-strong": minor
---

One gate/trigger contract, shared by every module that reads one:

> A gate is on while the signal is positive. A trigger is the transition from
> non-positive to positive.

These five packages used four different detectors between them. `ad`, `arp` and
`impulse` fired only when the parameter read **exactly `1`**; `karplus-strong`
wanted `>= 1` with the previous value below `0.9`; `adsr` used a Schmitt trigger
that opened at `0.9` and closed below `0.1`. So `Param.mul(trigger, 0.5)` drove
none of them, a gate peaking at 0.85 was silently ignored by the ADSR, and the
same clock fired an AD and an ADSR at different moments.

`> 0` is the rule SuperCollider, Faust, Max/RNBO and sndkit use - for
`@synthlet/ad` it is a return to the contract of the code it ports. It needs no
threshold to defend, and it survives `Param`'s `input * gain + offset`, so
scaling a gate line can no longer silently stop it working. A bipolar `Lfo` is
now a 50 % gate for free.

**Migration.** Any positive signal now fires. Two cases change:

- Feeding a `Clock`'s phase ramp straight to a trigger used to fire on the beat
  by accident, and now latches on. Connect `clock.gate` instead.
- A gate driven with `setTargetAtTime` never closes: the signal approaches zero
  without arriving. Use `setValueAtTime` or `linearRampToValueAtTime` - a gate
  line is never smoothed, the envelope is the smoother.

`@synthlet/ad` and `@synthlet/adsr` also read their control param per sample
when it is `a-rate`, so `env.gate.automationRate = "a-rate"` gives
sample-accurate sequencing instead of one quantised to the 128-frame render
quantum (up to 2.9 ms at 44.1 kHz). The declared default is still `k-rate` and
that path is byte-identical.
