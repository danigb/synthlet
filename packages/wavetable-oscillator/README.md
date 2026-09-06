# @synthlet/wavetable-oscillator

> A morphing wavetable oscillator module for [synthlet](https://github.com/danigb/synthlet)

`OscillatorNode` gives you four fixed waveforms. This module trades that for a
table of waveforms — a plane per timbre — and a `morph` position that
crossfades between the two nearest ones, at audio rate if you want it. Layered
on top: hard sync, through-zero FM, and Radna's stochastic mode for organic
drift and roughness. It generates its own table set and is audible the moment
it is constructed, with no network.

## Install

```bash
npm i @synthlet/wavetable-oscillator
```

## Usage

```ts
import {
  WavetableOscillator,
  registerWavetableOscillatorWorklet,
} from "@synthlet/wavetable-oscillator";

const audioContext = new AudioContext();
await registerWavetableOscillatorWorklet(audioContext);

// Sine -> triangle -> sawtooth -> square, generated at construction. No
// fetch, no `setWavetable` call needed to hear something.
const osc = WavetableOscillator(audioContext, {
  frequency: 220,
  morph: 0.5, // halfway between triangle and sawtooth
});
osc.connect(audioContext.destination);

osc.morph.value = 0.75; // towards the square plane
osc.frequency.value = 440;
```

## Parameters

| Param         | Default | Min    | Max   | Rate   | Meaning                                                                                                          |
| ------------- | ------- | ------ | ----- | ------ | ---------------------------------------------------------------------------------------------------------------- |
| `frequency`   | 440     | −20000 | 20000 | a-rate | Pitch in Hz. **Bipolar**: a modulator connected here is through-zero linear FM, not half-wave-rectified          |
| `detune`      | 0       | −1200  | 1200  | a-rate | Detune in cents                                                                                                  |
| `morph`       | 0       | 0      | 1     | a-rate | Wavetable position: 0 is the first plane, 1 the last. A jump is ramped over 64 samples rather than clicked       |
| `sync`        | 0       | 0      | 1     | a-rate | Hard sync. A rising edge restarts the table read at `phase`, band-limited, at the cost of two samples of latency |
| `segments`    | 8       | 0      | 256   | k-rate | Stochastic mode: how many parts the table is divided into. 0 and 1 both mean one                                 |
| `pitchChaos`  | 0.5     | 0      | 1     | a-rate | Stochastic mode: pitch random-walk step, as a fraction of `pitchSpread`                                          |
| `pitchSpread` | 0       | 0      | 24    | a-rate | Stochastic mode: pitch barrier in semitones. **0 disables the pitch path**                                       |
| `ampChaos`    | 0.5     | 0      | 1     | a-rate | Stochastic mode: amplitude random-walk step, as a fraction of `ampSpread`                                        |
| `ampSpread`   | 0       | 0      | 1     | a-rate | Stochastic mode: amplitude barrier. **0 disables the amplitude path**                                            |

Three construction options, not `AudioParam`s because each is a one-time
condition or an algorithm choice rather than a continuous signal:

- **`phase`** (`number | "random"`, default `0`) — where the read position
  starts. `"random"` draws once per instance, which is what stops a stack of
  detuned oscillators combing at the attack.
- **`catalog`** (`WavetableCatalog | string`, default the WaveEdit Online
  mirror) — where `loadWavetable` and `fetchWavetableNames` resolve bare
  names. See [Loading wavetables](#loading-wavetables).
- **`pitchPerSegment`** (`boolean`, default `false`) — the stochastic mode's
  pitch-deviation granularity. See [Stochastic mode](#stochastic-mode).

## Stochastic mode

Five parameters put Raphael Radna's [_Dynamic Stochastic Wavetable
Synthesis_](https://dafx23.create.aau.dk/) (DAFx-23) on top of whatever table is
loaded. The table is split into `segments` equal parts, and each part gets a
**pitch deviation** and an **amplitude deviation** drawn by a bounded random walk
that iterates once per wave cycle. The pitch deviation bends the read rate; the
amplitude deviation is added to the sample, interpolated across segment
boundaries so none of them is a step, and folded at ±1 — "a segmented, stochastic
wavefolder", in the paper's words.

The range is drift → chorus-like thickening → granular roughness → noise.

```ts
// organic drift: every note slightly different, nothing else changes
const osc = WavetableOscillator(ac, { pitchSpread: 0.2, pitchChaos: 0.3 });

// a moving, folded timbre
const rough = WavetableOscillator(ac, {
  segments: 16,
  ampSpread: 0.4,
  ampChaos: 0.6,
});

// the noise end, and the paper's own Fig. 4 setting
const noisy = WavetableOscillator(ac, { pitchSpread: 24, pitchChaos: 0.25 });
```

**Both spreads are 0 by default and that bypass is exact, not quiet.** With the
barriers closed the oscillator produces the same samples it would if this
section did not exist — the test suite asserts it sample for sample, and every
alias figure the package publishes is measured with the five parameters present.

The four a-rate parameters are **read once per wave cycle**, because a random
walk that iterates once per cycle is what the algorithm is. Connect an envelope
to make the roughness part of a note's shape; connecting an audio-rate source
will not give you audio-rate modulation.

`WavetableOscillator(ac, { pitchPerSegment: true })` draws the pitch deviation
once per _segment_ instead of once per cycle. That is standard DSWS and it is the
rougher, more aliased mode; the default is Radna §2.4's single-segment pitch
fluctuation, which measures 18.5 dB less energy above 10 kHz at the paper's own
settings.

### It aliases, and here is how much

**This stage is not band-limited, and the paper says so**: "further antialiasing
measures were not taken, as the linear interpolation of DSWS, like that of DSS,
ultimately produces its own aliasing artifacts" (§3.1). The knees the deviations
put at the segment boundaries are a broadband source that no amount of table
band-limiting removes, so `segments` and the two spreads are honestly
**roughness-versus-aliasing** knobs rather than tone controls.

What that costs, measured on a sine table so the numbers are the stage's own and
not the table's — alias SNR in dB, higher is cleaner:

| barrier | `ampSpread` at 440 Hz | at 1760 Hz |
| ------- | --------------------- | ---------- |
| 0.1     | 67.6                  | 43.5       |
| 0.25    | 62.0                  | 39.6       |
| 0.5     | 56.0                  | 34.0       |
| 1.0     | 46.0                  | 26.3       |

The oscillator's own floor is 57.4 dB at 440 Hz and 74.5 at 1760, so up to about
`ampSpread` 0.25 at 440 Hz the stage is quieter than the oscillator it is
modulating, and above that it is the loudest thing in the output. At the top of
every range the result is noise — which is the far end of Xenakis's pitch–noise
continuum and the point of the mode, not a defect.

Two things this package does that the paper does not. The single-segment pitch
mode is the **default** rather than an option, because it is the one mitigation
the paper actually implements. And the pitch deviation is applied to the phase
increment _before_ the mipmap level is chosen, so a segment read two octaves up
reads a table band-limited two octaves darker: measured, 10.9 dB at a
half-octave barrier across four segments.

## Loading wavetables

The oscillator generates its own table and is audible the moment it is
constructed, with no network — `setHarmonics` builds one from harmonic spectra
and `setWavetable` takes one you already have.

`loadWavetable` and `fetchWavetableNames` additionally fetch from a **catalog**,
which defaults to a static mirror of [WaveEdit Online](https://waveeditonline.com/)
at `https://smpldsnds.github.io/wavedit-online/samples`. **That mirror is a third
party's GitHub Pages site, not ours**: nothing here controls its uptime, its
contents or its CORS headers, and a strict CSP will block it. So it is
overridable, per synthlet's rule that every URL in the library can be
self-hosted:

```ts
// your own copy of the files, same NAME.WAV + files.json layout
const osc = WavetableOscillator(ac, { catalog: "/wavetables" });

// or resolve names however you like
const osc = WavetableOscillator(ac, {
  catalog: {
    url: (name) => bundled[name],
    names: async () => Object.keys(bundled),
  },
});

// a URL needs no catalog at all
await osc.loadWavetable("/tables/my-own.wav");
```

Any WAV file works: PCM at 8, 16, 24 or 32 bits, IEEE float at 32 or 64, and
`WAVE_FORMAT_EXTENSIBLE` around either. It must be mono, and its sample count
must be a whole number of frames — 256 by default, `{ length }` otherwise.
Anything else rejects with a message naming what was found.

A table that did not come from `setHarmonics` is **conditioned** before it
plays: each plane's DC is removed, every harmonic is rewritten to the same
canonical phase the generated tables use, and the planes' loudness is matched.
Measured on six real wavedit tables, the worst (`SYNLP10`) loses 5.7 dB on an
average crossfade before conditioning; all six measure 0.00 dB of loss, 0.0° of
phase disagreement, no DC and a peak of exactly 1.0000 after.

## Measured quality

Each of these is an assertion in `src/dsp.test.ts`, with the measured value in
a comment beside its threshold.

| What                                     | Measured                                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Pitch accuracy                           | Worst case 0.705 cents against a 5-cent bar, across 4 table lengths, 3 pitches, 2 sample rates                |
| Detune accuracy                          | Worst case 0.231 cents against a 2-cent bar, across 7 detune values                                           |
| Morph / table-swap click                 | The audit's own step of 0.7707 (full scale ±1) reduced to under 0.02, ramp complete inside one render quantum |
| Alias floor, mipmapped sawtooth          | 59.3 dB at 110 Hz down to 82.1 dB at 3520 Hz — 7 to 72 dB above the same table with no pyramid                |
| Octave-boundary crossing                 | Largest step in level or aliasing across a 300–700 Hz sweep is 0.175%, and it is not at a mip-level crossover |
| Hard sync, corrected vs. naive reset     | 17.6 to 33.9 dB of alias rejection bought for two samples (45.4 µs) of latency                                |
| Imported-table conditioning (worst case) | `SYNLP10`: 5.7 dB average crossfade loss → 0.00 dB, 121.9° phase disagreement → 0.0°                          |
| Stochastic mode at zero spread           | Bit-exact, sample for sample, against the same patch with the five inputs absent                              |

## Attribution

Original, derived from published descriptions:

| What                                                 | Citation                                                                                                                                                                                                                                                      |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The crossfade / swap discipline for `morph`          | Serra, Rubine & Dannenberg, _Analysis and Synthesis of Tones by Spectral Interpolation_, JAES 38(3), 1990, §1.1 (and its 1988 ICMC precursor)                                                                                                                 |
| The in-phase-harmonics constraint on plane authoring | Serra, Rubine & Dannenberg 1990 §1.2, confirmed independently by Horner, Beauchamp & Haken, _Wavetable and FM Matching Synthesis of Musical Instrument Tones_, ICMC 1992, §1, and Mohr, _Wavetable Interpolation of Multiple Instrument Tones_, ICMC 2005, §1 |
| Mip-level interpolation ("no step across an octave") | Trausmuth & Huovilainen, _POWERWAVE_, DAFx-05, §2.3                                                                                                                                                                                                           |
| The stochastic mode                                  | Radna, _Dynamic Stochastic Wavetable Synthesis_, DAFx-23                                                                                                                                                                                                      |

No code is ported from any of these — each is a from-scratch implementation of
a published algorithm description. See the repository's
[THIRD-PARTY-LICENSES.md](https://github.com/danigb/synthlet/blob/main/THIRD-PARTY-LICENSES.md)
for the complete provenance record.
