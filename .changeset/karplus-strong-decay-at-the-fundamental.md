---
"@synthlet/karplus-strong": patch
---

`decay` now means what it says at every `brightness`, not only at 1.

`ρ` was derived from Smith's `ρ^(f₀·t₆₀) = 0.001`, which accounts for the loop's
gain at **DC**. What is heard is its gain at the fundamental — `ρ` times the
damping filter's own response there, `G(ω₀) = h₀ + 2h₁·cos ω₀` — and that is
below 1 for every `brightness` below 1, and further below it the higher the note.
So a `decay: 1` measured **0.33 s at 1760 Hz** at the shipped brightness. `ρ` is
now divided by `G(ω₀)`.

Measured t₆₀ as a fraction of the requested `decay`, at `brightness: 0.5`:

|         | `decay` 0.5 | 1    | 3    |
| ------- | ----------- | ---- | ---- |
| 110 Hz  | 0.90        | 0.85 | 0.81 |
| 440 Hz  | 0.91        | 0.86 | 0.82 |
| 1760 Hz | 0.96        | 0.48 | 0.16 |

All of 110 and 440 Hz is now inside the 75–140% band Järveläinen and Tolonen
measured as inaudible; it used to sit at 0.85 / 0.83 with 1760 Hz at 0.33.

**And the 1760 Hz row is a real limit, now stated rather than hidden.** `G(ω₀)`
is below 1, so a decay longer than the filter alone can deliver would need a loop
gain above 1 at DC — an unbounded loop. The gain is clamped at 1 instead, and the
string decays as fast as the filter allows:

```
t₆₀max = ln(0.001) / (f₀ · ln(1/G(ω₀)))
```

which at `brightness: 0.5` is 2045 s at 110 Hz, 32 s at 440, **0.50 s at 1760**
and 22 ms at 5 kHz. A symmetric three-tap filter cannot do better — its gain at
ω₀ is 1 only when `h₁ = 0`, which is `brightness: 1` and no damping at all.
Reaching longer decays at high pitch and low brightness needs a per-note
loop-filter design (Bank and Välimäki 2003), which remains deferred.

**`brightness` no longer changes the decay time at all where it counts.** The
t₆₀ of a band around the fundamental now measures 1.000 s at every brightness
from 0 to 1 — it is exact by construction rather than approximate. The broadband
envelope still moves 11%, all of it the `brightness: 1` endpoint where every
partial decays at `ρ` instead of the high ones going first; `brightness` 0 and
0.5 are 0.4% apart.

This changes the sound of every patch with `brightness` below 1: notes ring for
the time asked for, which at mid and low pitch is longer than before.
