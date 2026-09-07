# @synthlet/state-variable-filter

> A zero-delay-feedback state variable filter with ten responses

Part of [Synthlet](https://github.com/danigb/synthlet).

Ten filter responses out of one topology, switchable by a parameter, with a
cutoff built to be swept. `BiquadFilterNode` covers the same responses but goes
unstable when you move its coefficients fast; this uses trapezoidal integration
with the feedback solved rather than delayed, so an envelope slammed onto the
cutoff stays stable and keeps its resonance.

That last sentence is measured, not asserted: a 3 kHz LFO driving the cutoff
across the entire 20 Hz–20 kHz range at Q=40 gives a peak output of 1.046 and
**zero non-finite samples**, at every sample rate from 8 kHz to 96 kHz.

This is the filter `MonoSynth` sweeps.

## Install

```bash
npm i @synthlet/state-variable-filter
```

Or `npm i synthlet` for every module at once.

## Usage

```ts
import {
  registerSvfWorklet,
  Svf,
  SvfType,
} from "@synthlet/state-variable-filter";

const ac = new AudioContext();
await registerSvfWorklet(ac);

const filter = Svf(ac, { type: SvfType.LowPass, frequency: 800, Q: 6 });
osc.connect(filter).connect(ac.destination);

// Cutoff and Q are both a-rate: these are smooth sweeps, not staircases
const env = AdsrEnv(ac, { attack: 0.01, decay: 0.4, gain: 4000, offset: 200 });
env.connect(filter.frequency);

// Three of the responses take a gain, in dB
const shelf = Svf(ac, { type: SvfType.HighShelf, frequency: 4000, gain: 6 });
```

## Parameters

| Param       | Default | Range      | Rate   | Meaning                  |
| ----------- | ------- | ---------- | ------ | ------------------------ |
| `type`      | 1       | 0 … 9      | k-rate | Response — see `SvfType` |
| `frequency` | 1000    | 20 … 20000 | a-rate | Cutoff in Hz             |
| `Q`         | 0.7071  | 0.025 … 40 | a-rate | Resonance                |
| `gain`      | 0       | -40 … 40   | k-rate | Shelf/bell gain in dB    |

`SvfType` is `ByPass` (0), `LowPass` (1), `BandPass` (2), `HighPass` (3),
`Notch` (4), `Peak` (5), `AllPass` (6), `Bell` (7), `LowShelf` (8) and
`HighShelf` (9).

The bandpass is **unity-gain** at its centre frequency, the way
`BiquadFilterNode`'s is. If you want the raw tap, whose gain there is `Q`, put a
gain of `Q` after the filter.

`gain` is read by `Bell`, `LowShelf` and `HighShelf` only; for the other seven
responses it is inert, and `gain: 0` is an exact bypass. On those three, `Q` sets
the resonance of the corner: at or below 0.7071 the response stays inside the
gain you asked for, and above it the corner peaks — a +12 dB high shelf at Q=40
reaches about +41 dB. That is what a resonant shelf is for.

`frequency` and `Q` are both `a-rate`, and this package is where that idiom in
the library started: filter cutoff is _the_ modulation target in subtractive
synthesis, and resonance opening with an envelope is as ordinary a patch. At
k-rate either one is a 344 Hz staircase, and a modulator faster than that is
aliased rather than quantised. **An unmodulated filter costs what it always
did** — 0.084% of a core, because a browser hands a constant parameter a
length-1 array and the DSP takes the branch it always took. Automating both
costs 0.261%.

`type` is structural — crossing from a lowpass to a highpass mid-block is a
discontinuity, not a sweep. `gain` is k-rate for a narrower reason: it feeds both
the mixing coefficients and the cutoff, so a per-sample `gain` would recompute
the frequency prewarping every sample too.

**The cutoff is bounded below Nyquist.** `maxValue` is 20 kHz at every sample
rate, but 20 kHz is above Nyquist below 40 kHz, so the prewarping curve is
continued as a tangent above 0.72 of Nyquist (Zavalishin §3.8, eq. 3.23) rather
than running into the pole of `tan`. Under a 44.1 kHz context nothing below about
15.9 kHz is affected; above it, and at lower sample rates, a requested cutoff is
a request rather than a promise.

Every channel of the input is filtered, so a stereo signal stays stereo.

## Credits

Ported from
[`SvfLinearTrapOptimised2.hpp`](https://github.com/FredAntonCorvest/Common-DSP/blob/master/Filter/SvfLinearTrapOptimised2.hpp)
in FredAntonCorvest/Common-DSP, MIT licensed, Copyright (c) 2016 Fred Anton
Corvest (FAC).

The algorithm is Andrew Simper (Cytomic), [_Solving the continuous SVF equations
using trapezoidal integration and equivalent
currents_](https://www.cytomic.com/files/dsp/SvfLinearTrapOptimised2.pdf). The
bell and the two shelves come from the same note; the bounded cutoff prewarping
is Vadim Zavalishin, _The Art of VA Filter Design_ (2018), §3.8.

Full notice in [LICENSE.md](LICENSE.md) and in the repository's
[THIRD-PARTY-LICENSES.md](https://github.com/danigb/synthlet/blob/main/THIRD-PARTY-LICENSES.md).

## License

MIT © [danigb](https://github.com/danigb)
