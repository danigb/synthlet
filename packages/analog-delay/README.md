# @synthlet/analog-delay

> A glide-based tape and bucket-brigade echo with multi-tap heads and one wear control

Part of [Synthlet](https://github.com/danigb/synthlet)

Moving the delay time on a tape or bucket-brigade machine **bends the pitch of
everything already in the line**. The Space Echo's Repeat Rate knob is a
performance control precisely because of that, and the Echoplex's sliding head
is the same effect made mechanical. The read head here travels to its new
position rather than handing over to a second one, so it resamples the buffer on
the way.

There is a second difference that matters more for the model's honesty. In a
clean digital delay, `time` and `tone` are independent. **In real analog
hardware they are not.** A bucket-brigade's delay is its stage count over its
clock rate, so lengthening the delay lowers the clock, which drags the
anti-alias and reconstruction filters down with it, which darkens every repeat.
Tape does the same thing through head gap and transport speed. That coupling is
the sound of an analog delay — the reason a Memory Man at maximum time is murky
and at minimum time is nearly clean. So there is **no `tone` parameter**:
bandwidth is derived from `time` and `age`.

The other half — precise, clean, pitch-preserving, tempo-relative — is
[`@synthlet/digital-delay`](https://github.com/danigb/synthlet/tree/main/packages/digital-delay).
One question tells you which you want: character and drift, or precision?

## Install

```bash
npm install @synthlet/analog-delay
```

## Usage

```ts
import {
  AnalogDelay,
  AnalogDelayMode,
  registerAnalogDelayWorklet,
} from "@synthlet/analog-delay";

await registerAnalogDelayWorklet(audioContext);

const delay = AnalogDelay(audioContext, {
  time: 0.3, // seconds
  feedback: 0.6,
  mix: 0.4,
  taps: 0.7, // more heads open
  age: 0.4, // wobblier, dirtier, darker, hissier
  mode: AnalogDelayMode.Tape,
});

source.connect(delay).connect(audioContext.destination);

// Drag this while it repeats. That is the whole point.
delay.time.value = 0.18;
```

## Parameters

| Param      | Default | Min  | Max | Rate   | Meaning                                                                                      |
| ---------- | ------- | ---- | --- | ------ | -------------------------------------------------------------------------------------------- |
| `time`     | 0.3     | 0.02 | 1.5 | k-rate | Record head to first playback head, in seconds. **Moving it bends pitch**                    |
| `feedback` | 0.4     | 0    | 1.2 | k-rate | The Space Echo's _Intensity_. Above 1 self-oscillates, bounded by the loop's soft limiter    |
| `mix`      | 0.3     | 0    | 1   | k-rate | Dry/wet                                                                                      |
| `taps`     | 0       | 0    | 1   | k-rate | Level envelope across the mode's tap positions. 0 is the first head only, 1 is all of them   |
| `age`      | 0.3     | 0    | 1   | k-rate | One composite wear control: more wobble, more saturation, less bandwidth, more hiss          |
| `wobble`   | 0.3     | 0    | 1   | k-rate | Wow and flutter depth, scaling on top of whatever `age` implies                              |
| `spread`   | 0       | 0    | 1   | k-rate | L/R time offset as a ratio — two machines, lightly apart. 0 is mono-compatible               |
| `mode`     | 0       | 0    | 1   | k-rate | `AnalogDelayMode`: 0 Tape, 1 BBD. Intermediate values wipe between them rather than snapping |

One construction option, `maxTime` (default 1.5 s), sizes the buffers. It is not
an `AudioParam` because it allocates.

Four things the table cannot carry:

- **`taps` is continuous, and it means something in both modes.** Tape taps are
  integer multiples of `time`, so opening more heads gives rhythmic
  subdivisions. The MN3011's six taps are deliberately irrational, so opening
  more of them gives a diffuse wash — which is what its datasheet says they are
  for. That difference in kind is what earns `mode` its slot; it is not a filter
  preset.
- **`age` and `wobble` are both here on purpose.** A well-maintained machine
  with an eccentric capstan is a real and desirable combination, and one
  composite knob cannot express it.
- **The tap offsets are clamped to the line.** At `time = maxTime` in BBD mode
  the 8.4x tap would need a 12.6 s stereo buffer, so the later taps fold onto
  the line's maximum instead of allocating for a case nobody asks for.
- **`feedback` at 1.2 self-oscillates, but not at every setting.** With `age`,
  `wobble` and `taps` all well up, a worn multi-head transport cannot hold the
  resonance and the loop decays. It stays finite and bounded either way.

## Sourced numbers

Unusually for this repository, the provenance here is datasheets and service
manuals rather than papers, and some of it is not sourced at all. Hiding that
would be worse than showing it.

| Figure                | Value                                                       | Confidence                                                          |
| --------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------- |
| BBD delay formula     | `delay = stages / (2 x clock)`                              | **High** — verified against four Panasonic datasheets               |
| MN3005                | 4096 stages, 10–100 kHz → 20.48–204.8 ms                    | **High** — primary datasheet                                        |
| MN3011 taps           | 3328 stages, taps at 396 / 662 / 1194 / 1726 / 2790 / 3328  | **High** — primary datasheet, tap table read directly               |
| MN3011 intent         | "natural reverberation effect ... by mixing output signals" | **High** — primary                                                  |
| BBD reference filters | 20 kHz                                                      | **High** — primary, but Panasonic's generic test jig                |
| RE-201 head ratios    | 1 : 2 : 3                                                   | Medium-high — Roland's RE-202 manual states 2x/3x/4x for four heads |
| Echorec drum          | 71 RPM → the 1.2 Hz wow rate                                | Medium-high — two independent figures that cross-check              |

**Chosen by ear, and labelled as chosen** in `src/dsp.ts`: the wow and flutter
depths, the flutter rate, the tape gap-loss constant, the `age` curve, and the
compander's reference level and time constants. No sourced wow/flutter figure
exists for the RE-201, EP-3 or Echorec, and studio-deck standards (DIN 0.2%) are
explicitly not applicable — tape echoes are widely described as far worse, and
nobody quantifies it. Rather than invent plausible numbers, one figure is
derived from the Echorec's drum speed and the rest are marked.

## Measured quality

Each of these is an assertion in `src/dsp.test.ts`, with the measured value in a
comment beside its threshold.

| What                          | Measured                                                                                 |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| Pitch through a `time` sweep  | 440 → 511 → 440 Hz, against 440 → 442 → 440 for `digital-delay` on the same sweep        |
| Bandwidth versus `time`, Tape | corner 14225 → 1774 Hz over five settings, within 15% of the derived shape               |
| Bandwidth versus `time`, BBD  | corner 11898 → 2290 Hz, likewise                                                         |
| `age`, four things at once    | wobble 0.67 → 2.31 Hz s.d., THD 3.2e-4 → 7.5e-2, corner 15249 → 3800 Hz, hiss 0 → 5.0e-5 |
| Tap ratios, Tape              | 0.99 : 2.00 : 3.00                                                                       |
| Tap ratios, BBD               | 0.99 : 1.67 : 3.01 : 4.35 : 7.04 : 8.39                                                  |
| Rhythmic versus diffuse       | envelope autocorrelation at the tap period 0.778 Tape, 0.024 BBD                         |
| Compander round trip          | 1.018 on steady material; 3.1x transient overshoot against Tape's 1.07                   |
| Mono compatibility            | L and R are bit-identical at `spread = 0`                                                |
| `feedback = 1.2` over 60 s    | peak 0.36 Tape / 0.75 BBD, still oscillating, no NaN and no denormal stall               |

## Attribution

Original, written from published descriptions and datasheets. No third-party
source was copied.

| What                            | Citation                                                                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Glide-based delay modulation    | Zavalishin & Parker, _Tape-like Delay Modulation_, DAFx-18; the one-pole coefficient is Mutable Instruments' `LoopingSamplePlayer` |
| The BBD chain and its compander | Raffel & Smith, _Practical Modeling of Bucket-Brigade Device Circuits_, DAFx-10                                                    |
| Variable-rate BBD formulation   | Holters & Parker, _A Combined Model for a Bucket Brigade Device and its Input and Output Filters_, DAFx-18                         |
| Hermite fractional reads        | Niemitalo, _Polynomial Interpolators for High-Quality Resampling of Oversampled Audio_, 2001                                       |
| Feedback high-pass and limiter  | Mutable Instruments Clouds — `fc = 20 + 100·feedback²`, and the cubic `x(27 + x²)/(27 + 9x²)`                                      |
| Delay-line structure            | Mutable Instruments `stmlib::DelayLine`                                                                                            |

See the repository's
[THIRD-PARTY-LICENSES.md](https://github.com/danigb/synthlet/blob/main/THIRD-PARTY-LICENSES.md).
