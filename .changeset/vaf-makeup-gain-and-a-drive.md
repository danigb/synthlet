---
"@synthlet/virtual-analog-filter": major
---

Makeup gain, and a `drive` parameter.

**Breaking: output level changes on all nine models.**

Two level defects, opposite in sign, both invisible because nothing measured
gain.

**Opening the resonance ducked the signal.** `MOOG_LADDER` measured exactly
`1/(1 + 4·resonance)` at DC — 0 dB at resonance 0, −5.1 at 0.2, −13.3 at 0.9 —
which is a ladder's uncompensated feedback attenuation. Every filter people
compare this to applies makeup gain; this one applied none. `OBERHEIM_BPF` had
the same defect upwards: its peak gain _was_ Q, rising from 0.707 to 28.6, so
resonance was a 32 dB volume control.

Passband gain is now flat across the whole resonance range on every model,
measured to within 0.005 dB. The makeup is per topology and each one was
measured before it was written:

| model                              | makeup                              | source                                                   |
| ---------------------------------- | ----------------------------------- | -------------------------------------------------------- |
| `MOOG_LADDER`                      | `1 + 4·resonance`                   | Huovilainen 2004, Zavalishin §5                          |
| `MOOG_HALF_LADDER`                 | `1 + 2·resonance`                   | the same, half the ladder                                |
| `KORG35_*`, `OBERHEIM_LPF/HPF/BSF` | none — measured flat to 3e-4        | measurement, not a citation                              |
| `OBERHEIM_BPF`                     | `1/Q`                               | the normalisation `@synthlet/state-variable-filter` uses |
| `DIODE_LADDER`                     | solved from its own DC steady state | no closed form exists in resonance alone                 |

**The diode ladder was a fuzzbox.** It clipped `100 * input` with no way to
turn it down, so above an input of about 0.01 the output fundamental was
constant and only the zero crossings survived — a distortion box with a filter
after it, and the filter's own character inaudible underneath. This is
[faustlibraries #214](https://github.com/grame-cncm/faustlibraries/issues/214),
open upstream since February 2025, which reports needing −41 dB of input trim.

The new **`drive`** parameter is that gain, a-rate, default 1 and range 0…100.
At 1 the diode ladder is clean: a 0.5-amplitude sine now comes through within
1 dB of its small-signal gain instead of sitting at a constant 0.265. At 100 it
is the fuzzbox it used to be, on purpose.

On `OBERHEIM_*` and `DIODE_LADDER` `drive` reaches a real saturator. On
`MOOG_LADDER`, `MOOG_HALF_LADDER` and `KORG35_*` there is nothing to drive
into — those circuits contain no clipper and no `tanh` by the library's design
— so there it is input gain and nothing more. That is stated in the parameter's
own comment rather than implied away.
