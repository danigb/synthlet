# @synthlet/wavetable-oscillator

> A morphing wavetable oscillator module for [synthlet](https://github.com/danigb/synthlet)

## Install

```bash
npm i @synthlet/wavetable-oscillator
```

## Stochastic mode

Five parameters put Raphael Radna's [*Dynamic Stochastic Wavetable
Synthesis*](https://dafx23.create.aau.dk/) (DAFx-23) on top of whatever table is
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

| parameter | range | rate | what it does |
|---|---|---|---|
| `segments` | 0–256 | k-rate | How many parts the table is cut into. More is brighter and rougher; 0 and 1 both mean one |
| `pitchChaos` | 0–1 | a-rate | How much of the pitch barrier the walk may cross in one cycle |
| `pitchSpread` | 0–24 semitones | a-rate | The pitch barrier. **0 switches the pitch path off** |
| `ampChaos` | 0–1 | a-rate | The same, for the amplitude walk |
| `ampSpread` | 0–1 | a-rate | The amplitude barrier. **0 switches the amplitude path off** |

**Both spreads are 0 by default and that bypass is exact, not quiet.** With the
barriers closed the oscillator produces the same samples it would if this
section did not exist — the test suite asserts it sample for sample, and every
alias figure the package publishes is measured with the five parameters present.

The four a-rate parameters are **read once per wave cycle**, because a random
walk that iterates once per cycle is what the algorithm is. Connect an envelope
to make the roughness part of a note's shape; connecting an audio-rate source
will not give you audio-rate modulation.

`WavetableOscillator(ac, { pitchPerSegment: true })` draws the pitch deviation
once per *segment* instead of once per cycle. That is standard DSWS and it is the
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
|---|---|---|
| 0.1 | 67.6 | 43.5 |
| 0.25 | 62.0 | 39.6 |
| 0.5 | 56.0 | 34.0 |
| 1.0 | 46.0 | 26.3 |

The oscillator's own floor is 57.4 dB at 440 Hz and 74.5 at 1760, so up to about
`ampSpread` 0.25 at 440 Hz the stage is quieter than the oscillator it is
modulating, and above that it is the loudest thing in the output. At the top of
every range the result is noise — which is the far end of Xenakis's pitch–noise
continuum and the point of the mode, not a defect.

Two things this package does that the paper does not. The single-segment pitch
mode is the **default** rather than an option, because it is the one mitigation
the paper actually implements. And the pitch deviation is applied to the phase
increment *before* the mipmap level is chosen, so a segment read two octaves up
reads a table band-limited two octaves darker: measured, 10.9 dB at a
half-octave barrier across four segments.

## Wavetables

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
