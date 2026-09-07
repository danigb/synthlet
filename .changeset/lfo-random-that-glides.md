---
"@synthlet/lfo": minor
---

Two continuous random shapes: `LfoType.RandSmooth` (11) and `LfoType.Drift` (12).

`RandSampleHold` was the only random shape here, and it is also the loudest thing
the module emits — measured largest single-sample step 1.41623 at 5 Hz, where a
sine's is 0.00071. So "random modulation" and "audible stepping" were the same
setting, and there was no way to put a random on a gain or a cutoff without a
click.

- **`RandSmooth`** — the same draw as `RandSampleHold`, travelled to instead of
  jumped to. One random target per cycle, faded between targets with Perlin's
  quintic `6t⁵ − 15t⁴ + 10t³`. Quintic and not linear because linear
  interpolation has a discontinuous derivative at every target, so it would have
  an audible corner once a cycle — a smaller version of the problem it solves.
- **`Drift`** — two octaves of one-dimensional gradient (Perlin) noise sampled
  along the phase, per Popov 2018. A rate, but no audible period.

They are not redundant with each other: measured, **100%** of `RandSmooth`'s
local extrema fall on a cycle boundary against **0.7%** of `Drift`'s. One has a
beat and the other does not, which is why every synth that ships a smooth random
ships both.

Both are per instance, bipolar in ±1 and zero-mean, and both measure under 0.005
of single-sample step at 5 Hz.

Appended, not inserted: values 0–10 are untouched, and `type`'s `maxValue` goes
from 10 to 12. Neither is a noise _source_ — `@synthlet/noise` is white and pink
at audio rate; these are one random value per LFO cycle.
