---
"@synthlet/chorus": major
---

Five parameters, in the units they claim. **Every existing patch will sound
different.**

All four of the old ones were wired to the wrong four things. Faust declared
its sliders in one order and mapped `ParamIndex` to them in another; the
hand-written TypeScript port assigned them in declaration order. Measured at
48 kHz, from rendered audio:

| The knob said | What it actually controlled | Measured                                                            |
| ------------- | --------------------------- | ------------------------------------------------------------------- |
| `delay`       | dry/wet mix                 | dry gain = exactly `1 - knob`                                       |
| `rate`        | base delay time             | `0 ... 85.33 ms`, in 8 taps                                         |
| `depth`       | per-voice offset sigma      | first tap `10.667 -> 15.999 ms` with the LFOs stopped               |
| `deviation`   | **LFO rate in Hz**          | `0.0830 / 0.1659 / 0.2489 / 0.3320 Hz` at `0.25 / 0.5 / 0.75 / 1.0` |

So the LFO speed - without which this is not a chorus - was reached through a
knob called `deviation`, and it topped out at **1 Hz** because `params.ts`
declared `0 ... 1` where the Faust source declared `0.01 ... 7.0 Hz`. The
README, the docs page and the parameter comments all described the labels, so
all three were wrong about all four.

**Migration.** There is no alias for any of these and no compatibility mode: a
legacy mode would mean shipping the bug twice. If you have a patch, read the
table above - your `deviation` was the rate, your `rate` was the delay, your
`delay` was the mix, and your `depth` was the per-voice spread. The delay time
is no longer exposed at all: the voicing owns it, because exposing it is how
the defaults ended up at 5.33-42.67 ms, which is Dattorro's _doubling_ range
(10-100 ms) rather than his chorus range (1-30, nominal 5).

The five now:

| Param   | Rate               | Range                               | Default |
| ------- | ------------------ | ----------------------------------- | ------- |
| `mode`  | k-rate, structural | `JUNO` \| `ENSEMBLE` \| `DIMENSION` | `JUNO`  |
| `rate`  | k-rate, ramped     | Hz, 0 ... 7                         | 0.5     |
| `depth` | k-rate, ramped     | 0 ... 1, scaled per mode into ms    | 0.6     |
| `mix`   | k-rate, ramped     | 0 ... 1                             | 0.5     |
| `width` | k-rate, ramped     | 0 ... 1                             | 1       |

`rate: 0` means stopped, and is a legitimate setting rather than a test hook.

`depth` stays normalised deliberately, and it is the one place the old file's
"this is a pedal, not a modular utility" argument holds: the useful excursion
depends on `rate` - Martens & Marui (2006) put the upper bound at
`4800*(1/rate) - 350 us` - and on the voicing, so a millisecond value would be
a number you have to solve a regression to choose. `0 ... 1` meaning "as deep
as this rate and this voicing can carry" is the honest unit. `rate` is not
treated the same way because hertz is a unit that exists.

`width` is Dattorro's requirement rather than an extra: "it is prudent to place
a stereo field control at the output of any chorus algorithm", because
quadrature stereo placement is often unwanted in a mix.

**Stereo in, stereo out.** `worklet.ts` read `inputs[0][0]` and nothing else,
so a stereo source was silently halved. Mono in still produces stereo out -
that is the point of the effect - and a stereo source now survives. A
disconnected input flushes the line instead of freezing its last block in it.

`CHORUS_MODE_DEFAULTS` is exported so a host can apply a voicing's own settings
when the mode selector changes. An AudioParam has one `defaultValue` and cannot
ask a table for one, so this is two lines in a host rather than a sentinel
outside the declared range.
