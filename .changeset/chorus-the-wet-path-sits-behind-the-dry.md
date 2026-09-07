---
"@synthlet/chorus": minor
---

Put a filter on the wet path, and gain-stage it.

There was no filtering anywhere in the engine this replaces: eight delayed
copies summed at full bandwidth and mixed with the dry, which is what a chorus
sounds like when nobody decided what it should sound like - bright, thin, and
sitting on top of the source rather than behind it.

The single most audible thing an analog chorus does that a digital one does not
is roll the wet path off. `rune06`'s CE-2 model has this as its most concrete
inheritance from the schematic - a 4-pole cascade at **10620, 8830, 7234 and
4020 Hz** - and that cascade is now on the wet output, as TPT one-poles with
`g = tan(pi*fc/SR)`.

**Post-filter only.** A BBD needs one before the line too, because the line is
a sampler; a digital line is not, so that half's anti-alias role does not exist
and what is left of it is a second helping of the same rolloff, which the post
cascade supplies for half the poles.

**Where the pole count stopped mattering, measured.** Against the two lower
poles alone, at 48 kHz:

|             | -3 dB   | 1 kHz | 2 kHz | 4 kHz | 8 kHz | 16 kHz |
| ----------- | ------- | ----- | ----- | ----- | ----- | ------ |
| 4 poles     | 2931 Hz | -0.4  | -1.5  | -5.1  | -15.3 | -43.5  |
| 7234 + 4020 | 3339 Hz | -0.3  | -1.2  | -4.0  | -11.0 | -27.2  |

Within 0.3 dB below 2 kHz and 1.1 dB at 4 kHz; 4.2 dB apart at 8 kHz and
16.3 dB at 16 kHz. Two poles buy the audible body, the other two buy the top
two octaves - which is the region that decides whether the wet sits behind the
dry or hisses on top of it. Four for `JUNO` and `DIMENSION`, two for
`ENSEMBLE`, which wants the air.

Measured -3 dB corner of the comb's peak envelope, wet only:

| voicing     | 44.1 kHz | 48 kHz  | 96 kHz  |
| ----------- | -------- | ------- | ------- |
| `JUNO`      | 4282 Hz  | 4277 Hz | 4043 Hz |
| `ENSEMBLE`  | 4797 Hz  | 4796 Hz | 4799 Hz |
| `DIMENSION` | 4533 Hz  | 4529 Hz | 4348 Hz |

**`DIMENSION` gets its own pair.** The difference output cancels the common
mode, and at low frequencies two short delayed copies are nearly identical, so
the bass cancels with it. A 150 Hz wet high-pass and a complementary dry low
shelf put it back: mono level against the input over 40-200 Hz is **-0.48 dB**,
the best of the three.

**Gain staging is Mutable's, verbatim**: `dry = 1 - mix*0.5`, `wet = mix`, and
the wet normalised per _channel_ by the gains that actually reach it rather
than by voice count - a voice panned hard to one channel is the only thing in
it, so dividing `JUNO`'s two by two would halve an effect that never sums.
Note that dry is not `1 - mix`. Mono sum on pink noise at each voicing's
defaults: **-0.51 / -0.70 / -1.02 dB**. With `dry = 1 - mix` the same three
read -2.91, -3.18 and -4.54.

The cost is that `mix: 1` is not fully wet, so Dattorro's vibrato is not
reachable from this knob. Deliberate: a chorus is an insert effect and a centre
that ducks 4.5 dB is a defect a user finds out about from a mix engineer.

**Two measurements did not come out where the tickets expected, and both are
recorded rather than tuned away.**

Broadband L/R correlation is **0.891 / 0.954 / 0.904**, not the 0.1 ... 0.5 the
tickets set. That band comes from the decorrelation literature, which measures
_decorrelators_ - devices whose whole output is the processed signal. A chorus
sums a dry path identical in both channels with a wet path deliberately rolled
off above ~4 kHz, so above that corner there is nothing but the dry and the
correlation there is 1 by construction. Reaching the band would mean removing
either the dry or the wet filter.

Per-band correlation at `JUNO`'s defaults is **0.696 (100-500 Hz), 0.734
(500-2000), 0.851 (2-8 kHz)** - more decorrelated at the bottom, where the
literature prefers less. That follows the CE-2 pole set rather than being an
oversight: a BBD chorus puts its wet energy in the low mids, so that is where
its width is.

Correlation is measured on **pink** noise. White noise puts half its energy
above 12 kHz, which no musical signal does, and a rolled-off wet path has
nothing up there - measured on white, any filtered-wet chorus reads near 1, not
because the effect is narrow but because the measurement is looking where the
effect isn't.

**And the filters made `NaN` permanent, so there is a guard.** A delay line
flushes, but every one-pole is `state = state + g*something` and `NaN` plus
anything is `NaN`. The block is scanned once after rendering; anything
non-finite resets the engine and zeroes the block. `vaf 05`'s finding and its
answer. A 10-second silent render stays finite and does not fall into
denormals, which the alternating `DENORMAL` constant is what prevents.
