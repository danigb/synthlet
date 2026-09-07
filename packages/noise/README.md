# @synthlet/noise

> White and pink noise, as an audio worklet

Part of [Synthlet](https://github.com/danigb/synthlet).

A noise source you can `connect()`. Web Audio's usual answer is an
`AudioBufferSourceNode` looping a buffer of random samples, which loops audibly
and costs the memory; this generates per sample and never repeats.

Two flavours: **white** (flat spectrum, a fresh random per sample) and **pink**
(−3 dB per octave — the one that sounds even to the ear, and the raw material
for a snare or a wind patch).

## Install

```bash
npm i @synthlet/noise
```

Or `npm i synthlet` for every module at once.

## Usage

```ts
import { registerNoiseWorklet, Noise, NoiseType } from "@synthlet/noise";

const ac = new AudioContext();
await registerNoiseWorklet(ac);

const noise = Noise(ac, { type: NoiseType.Pink });
noise.connect(filter).connect(ac.destination);
```

## Parameters

| Param  | Default | Range | Rate   | Meaning                                       |
| ------ | ------- | ----- | ------ | --------------------------------------------- |
| `type` | 0       | 0 … 1 | k-rate | `NoiseType.White` (0) or `NoiseType.Pink` (1) |

`type` is `k-rate` and structural: each type is a different generator with its
own state — white is a fresh random per sample, pink is a filter with history —
so crossing between them mid-block would splice two unrelated signals rather
than interpolate. An unrecognised value falls back to white without warning,
because `type` is an `AudioParam` and a modulator can legitimately pass through
values between the two.

`getNoiseTypes()` returns the list as `{ name, value }` pairs, for building a
selector.

## Credits

The pink noise generator implements ["A New Shade of
Pink"](https://www.ridgerat-tech.us/pink/newpink.htm) by Larry Trammell,
(c) Larry Trammell 2016-2020, licensed under [Creative Commons Attribution 4.0
International](https://creativecommons.org/licenses/by/4.0/).

Full notice in [LICENSE.md](LICENSE.md) and in the repository's
[THIRD-PARTY-LICENSES.md](https://github.com/danigb/synthlet/blob/main/THIRD-PARTY-LICENSES.md).

## License

MIT © [danigb](https://github.com/danigb)
