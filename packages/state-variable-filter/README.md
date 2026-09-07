# @synthlet/state-variable-filter

> A zero-delay-feedback state variable filter with seven responses

Part of [Synthlet](https://github.com/danigb/synthlet).

Seven filter responses out of one topology, switchable by a parameter, with a
cutoff built to be swept. `BiquadFilterNode` covers the same responses but goes
unstable when you move its coefficients fast; this uses trapezoidal integration
with the feedback solved rather than delayed, so an envelope slammed onto the
cutoff stays stable and keeps its resonance.

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

// The cutoff is a-rate: this is a smooth sweep, not a staircase
const env = AdsrEnv(ac, { attack: 0.01, decay: 0.4, gain: 4000, offset: 200 });
env.connect(filter.frequency);
```

## Parameters

| Param       | Default | Range      | Rate   | Meaning                  |
| ----------- | ------- | ---------- | ------ | ------------------------ |
| `type`      | 1       | 0 … 6      | k-rate | Response — see `SvfType` |
| `frequency` | 1000    | 20 … 20000 | a-rate | Cutoff in Hz             |
| `Q`         | 0.5     | 0.025 … 40 | k-rate | Resonance                |

`SvfType` is `ByPass` (0), `LowPass` (1), `BandPass` (2), `HighPass` (3),
`Notch` (4), `Peak` (5) and `AllPass` (6).

`frequency` is `a-rate`, and this package is where that idiom in the library
started: filter cutoff is _the_ modulation target in subtractive synthesis, and
at k-rate an envelope sweep is a 344 Hz staircase. The coefficients are
recomputed per sample when the cutoff is automated and once per block when it
is not, so an unmodulated filter costs what it always did.

`type` is structural — crossing from a lowpass to a highpass mid-block is a
discontinuity, not a sweep. `Q` is k-rate today, and that is an acknowledged
gap rather than a principle: Q opening with an envelope is as ordinary a patch
as cutoff sweeping with one, and `@synthlet/virtual-analog-filter` already
declares its `resonance` a-rate.

Every channel of the input is filtered, so a stereo signal stays stereo.

## Credits

Ported from
[`SvfLinearTrapOptimised2.hpp`](https://github.com/FredAntonCorvest/Common-DSP/blob/master/Filter/SvfLinearTrapOptimised2.hpp)
in FredAntonCorvest/Common-DSP, MIT licensed, Copyright (c) 2016 Fred Anton
Corvest (FAC).

The algorithm is Andrew Simper (Cytomic), [_Solving the continuous SVF equations
using trapezoidal integration and equivalent
currents_](https://www.cytomic.com/files/dsp/SvfLinearTrapOptimised2.pdf).

Full notice in [LICENSE.md](LICENSE.md) and in the repository's
[THIRD-PARTY-LICENSES.md](https://github.com/danigb/synthlet/blob/main/THIRD-PARTY-LICENSES.md).

## License

MIT © [Daniel Gómez Blasco](https://github.com/danigb)
