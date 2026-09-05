---
"@synthlet/karplus-strong": minor
---

`stretch` and `blend`: Karplus and Strong's own two probabilistic variants,
from the 1983 paper this package is named after - the ones its title is about,
"Digital Synthesis of Plucked-String **and Drum** Timbres". Both are neutral at
their defaults, so nothing changes for an existing patch: with `stretch: 1` and
`blend: 1` the module renders the same samples it did before, bit for bit.

**`stretch`** (1-20, default 1) is their decay stretching: apply the damping
filter with probability `1/S` and pass the sample through unchanged otherwise,
so "the decay time of each overtone is approximately multiplied by S". The loop
gain `decay` sets is applied every round trip whatever the coin says, so `decay`
stays the ceiling and what this lengthens is the high end - which is what the
damping filter shortens. The third partial of a 1760 Hz string decays 3.5x more
slowly at `stretch: 4`.

```ts
KarplusStrong(ac, { frequency: 1760, decay: 1, stretch: 4 }); // high notes ring
```

It does not detune the string as it moves - measured spread across
`stretch: 1...20` is under 0.8 cents - which is not free: it is the linear-phase
damping filter, whose delay is exactly one sample whether the coin applies it
or skips it. It is also **not** dispersion, which moves partial _frequencies_
rather than lengthening their decay.

**`blend`** (0-1, default 1) is the drum algorithm Kevin Karplus discovered in
December 1979: negate the loop signal with probability `1 - b`.

- **1** is the plucked string, and the buffer length is the pitch.
- **1/2** is "drumlike", and it measures like one: the peak autocorrelation
  falls from 0.996 to 0.16 and the spectral flatness rises from 0.00003 to
  0.54. At that blend the buffer length stops being a pitch and becomes a decay
  - "the decay time is roughly proportional to p" - so `frequency` is a drum
    size knob: 100 Hz is their snare, 1 kHz their brushed tom.
- **0** is their "harplike" case: the pitch drops exactly an octave and only
  the odd harmonics of the new fundamental survive, measured 80 dB down.

With `blend` below 1 the loop is loaded with a **constant** rather than noise,
which is their Fig. 4: "the drum algorithm will create the randomness itself...
starting with a constant gives some buildup before the decay". Set `position: 0`
with it - the pick-position comb is a string filter and a comb annihilates a
constant.

The coins come from a private xorshift32 rather than `Math.random` - measured
3x cheaper (1.35 ns a call against 4.05), and separate, so the loop's randomness
does not disturb the excitation's.
