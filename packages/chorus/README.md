# @synthlet/chorus

> A stereo chorus in three voicings, as an audio worklet

Part of [Synthlet](https://github.com/danigb/synthlet).

Several delayed copies of the input, each read at a position its own LFO moves,
summed to a stereo pair. Mono in, stereo out — the width comes from spreading
the voices' LFOs apart rather than from panning — and a stereo source stays
stereo.

Three voicings share one engine, because they are the same computation: N taps
on one delay line per channel, read with a 4-point Hermite interpolator, moved
by an LFO bank, combined by an output matrix. What separates a Juno from a
Solina from a Dimension D is voice count, LFO rates, phase offsets, output
matrix and wet EQ — five tables, not five algorithms.

## Install

```bash
npm i @synthlet/chorus
```

Or `npm i synthlet` for every module at once.

## Usage

```ts
import { registerChorusWorklet, Chorus } from "@synthlet/chorus";

const ac = new AudioContext();
await registerChorusWorklet(ac);

const chorus = Chorus(ac);

source.connect(chorus).connect(ac.destination);
```

`Chorus(ac)` with nothing passed is `JUNO` at its own settings, which is meant
to be the answer rather than a starting point.

## Voicings

The voicing is the choice that matters; the four knobs are the adjustment
afterwards.

| Mode        | What it is                                                    | Reach for it when                          |
| ----------- | ------------------------------------------------------------- | ------------------------------------------ |
| `JUNO`      | Two voices in antiphase on a 3 ms centre, one LFO             | Anything. It is the default for a reason   |
| `ENSEMBLE`  | Three taps 120° apart on two incommensurate LFOs, 4 ms centre | String stacks and thick pads               |
| `DIMENSION` | Antiphase with a **difference** output, 8.5 ms centre         | Sustained pads and buses — wide, no wobble |

`DIMENSION` is the one worth explaining. Its stereo output is formed as
`L = d0 − d1`, `R = d1 − d0`, so the common-mode pitch modulation cancels while
the differential spatial motion survives: chorus without the vibrato. Measured,
it moves the pitch **4.5 cents** at its defaults where `JUNO` moves it 15.5.
That is what makes it usable on a sustained pad, where `JUNO`'s wobble becomes
seasickness.

Each voicing carries its own settings for the other four parameters, exported
as `CHORUS_MODE_DEFAULTS`, and a `mode` change cross-fades over 5 ms so it can
be switched while sound is playing.

```ts
import { Chorus, ChorusMode, CHORUS_MODE_DEFAULTS } from "@synthlet/chorus";

const chorus = Chorus(ac, { mode: ChorusMode.Ensemble });
const defaults = CHORUS_MODE_DEFAULTS[ChorusMode.Ensemble];
chorus.rate.value = defaults.rate;
chorus.depth.value = defaults.depth;
```

## Parameters

| Param   | Default | Range        | Rate   | Meaning                                                          |
| ------- | ------- | ------------ | ------ | ---------------------------------------------------------------- |
| `mode`  | `JUNO`  | 0 … 2        | k-rate | Which voicing                                                    |
| `rate`  | 0.5     | 0 … 7 **Hz** | k-rate | LFO speed. 0 stops them, leaving a static comb                   |
| `depth` | 0.6     | 0 … 1        | k-rate | Excursion, as a fraction of what this rate and voicing can carry |
| `mix`   | 0.5     | 0 … 1        | k-rate | Dry/wet. 0 is an exact bypass                                    |
| `width` | 1       | 0 … 1        | k-rate | Stereo field control on the wet path                             |

Per-mode defaults: `JUNO` `rate 0.5 / depth 0.6`, `ENSEMBLE`
`rate 0.75 / depth 0.7`, `DIMENSION` `rate 0.5 / depth 0.8`. All three default
to `mix 0.5` and `width 1`.

`depth` is the one parameter that is not a physical unit, and deliberately: the
useful excursion depends on `rate` — faster LFOs need proportionally less depth
— and on the voicing, so a millisecond value would be a number you have to
solve a regression to choose. `1` means "as deep as this rate and this voicing
can carry", against the smaller of the voicing's ceiling and Martens & Marui's
`4800·(1/rate) − 350 µs`.

All five are `k-rate` and handed to the engine's per-block update, then ramped
per sample inside it. **The engine's own LFOs are what move per sample**, which
is what makes this a chorus rather than a delay you have to modulate yourself.

## Detune

The number a musician can act on. A sinusoidally modulated delay gives a pitch
ratio of `1 ± W·Ω·T`, so the excursion in milliseconds and the rate in hertz
together fix the detune in cents:

| Setting                            | Excursion | Detune      |
| ---------------------------------- | --------- | ----------- |
| `JUNO` at `rate 0.5`, full depth   | ±2.00 ms  | ±10.8 cents |
| `JUNO` at `rate 6`, full depth     | ±0.45 ms  | ±29.1 cents |
| `ENSEMBLE` at `rate 0.75`, default | ±2.57 ms  | ±20.8 cents |

The rate coupling is why the second row is deeper in cents while being shallower
in milliseconds: pitch follows the _derivative_ of the delay, so a faster LFO
bends further for the same excursion.

## Measured quality

Each of these is an assertion in `src/dsp.test.ts`, with the measured value in a
comment beside its threshold. Nothing is claimed here that the suite does not
check.

| What                           | Measured                                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| Delay accuracy                 | tap within 0.15 ms of the voicing's centre, at 44.1 / 48 / 96 kHz                        |
| LFO rate accuracy              | within 0.05 Hz of the value asked for, at 1 / 3 / 7 Hz and all three sample rates        |
| Depth accuracy                 | within 8% of `depth × min(ceiling, 4800/rate − 350 µs)` at 0.5 / 2 / 6 / 7 Hz            |
| Pitch modulation               | `JUNO` 15.5 cents, `ENSEMBLE` 15.1, `DIMENSION` 4.5, at their defaults                   |
| Wet-path corner                | −3 dB at 4043–4799 Hz across the three voicings and all three sample rates               |
| Mono-sum level, pink noise     | `JUNO` −0.51 dB, `ENSEMBLE` −0.70, `DIMENSION` −1.02                                     |
| `DIMENSION` low end, 40–200 Hz | −0.48 dB against the input — the best of the three                                       |
| L/R correlation, pink noise    | `JUNO` 0.891, `ENSEMBLE` 0.954, `DIMENSION` 0.904                                        |
| Per-band correlation, `JUNO`   | 0.696 at 100–500 Hz, 0.734 at 500–2000, 0.851 at 2–8 kHz                                 |
| LFO period                     | no voicing's rate set closes under 60 s                                                  |
| Interpolation                  | `readHermite` reproduces a cubic exactly; a linear read is off by 1e-3                   |
| Allocation                     | nothing constructed after the factory returns, over 200 blocks                           |
| Survival                       | a `NaN` block resets and recovers; 10 s of silence stays finite and out of the denormals |

**A note on the correlation numbers**, because 0.9 looks high. A chorus sums a
dry path that is identical in both channels with a wet path deliberately rolled
off above ~4 kHz, so above that corner there is nothing in the output but the
dry, and the correlation there is 1 by construction. The decorrelation
literature's 0.1 … 0.5 describes a _decorrelator_, whose whole output is the
processed signal. The per-band row is where the mechanism is visible.

They are measured on **pink** noise. White noise puts half its energy above
12 kHz, which no musical signal does, so measured on white any chorus with a
filtered wet path reads near 1 — not because the effect is narrow but because
the measurement is looking where the effect isn't.

## Sourced numbers

| What                                              | Where from                                                                                      |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 4-point Hermite interpolation                     | Niemitalo, _Polynomial Interpolators for High-Quality Resampling_, 2001, §7                     |
| Not two-point linear, across many voices          | Dattorro, _Effect Design Part 2_, JAES 45(10), 1997, §6.1                                       |
| `JUNO` 3 ms centre                                | `rune06`'s CE-2 model, `CENTER_DELAY_MS = 3.0`                                                  |
| `JUNO` 0.5 / 0.8 / 1 Hz                           | Juno-60 chorus modes I, II and I+II                                                             |
| `ENSEMBLE` 4 ms base, 3.67 ms ceiling, 160:16 mix | Mutable Instruments Plaits `Ensemble`: 192 and 176 samples at 48 kHz                            |
| `ENSEMBLE` two rates, 0.75 Hz and ×8.708          | Plaits' 0.75 / 6.57 Hz pair, with the ratio made irrational — see below                         |
| `DIMENSION` 8.5 ms, ±2.5 ms, 0.5 Hz               | Roland SDD-320 published figures                                                                |
| Depth/rate coupling                               | Martens & Marui, _Perceptual Evaluation of Chorus Effects_, 2006, upper bound, R² = 0.94        |
| Wet lowpass at 10620 / 8830 / 7234 / 4020 Hz      | `rune06`'s CE-2 model, from the schematic                                                       |
| `dry = 1 − mix·0.5`                               | Mutable Instruments `Ensemble`, copied verbatim because it is tuned rather than derived         |
| Detune in cents                                   | Dattorro's pitch-ratio extrema, `1 ± W·Ω·T`                                                     |
| Stereo field control                              | Dattorro: "it is prudent to place a stereo field control at the output of any chorus algorithm" |

**Why the `ENSEMBLE` rate ratio is not Plaits' exactly.** Plaits runs its two
accumulators at 0.75 Hz and 6.57 Hz, whose ratio is `219/25` — so the pattern
closes after 25 slow cycles, about 33 seconds. The fast multiplier here is
`6φ − 1 = 8.7082`, irrational by construction, which puts the fast LFO at
6.531 Hz: 0.6% from Plaits' figure, musically the same pair, and incommensurate
for good rather than for 33 seconds. The engine this replaced ran eight LFOs at
`rate × {1, ½, ⅓, ¼, ⅙, ⅐, ⅛}`, every one a rational fraction of every other,
so the whole eight-voice pattern repeated on a sixteen-second loop.

No third-party source was copied. The delay line is `scripts/_delay.ts`, shared
with `analog-delay`, `digital-delay` and `granite`.

## License

MIT © [danigb](https://github.com/danigb)
