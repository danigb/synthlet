# @synthlet/dattorro-reverb

> Dattorro's plate reverb, with its nine coefficients exposed

Part of [Synthlet](https://github.com/danigb/synthlet).

The plate reverb from Jon Dattorro's 1997 JAES paper — the figure-of-eight tank
with modulated allpasses that most software plates descend from. Web Audio's
`ConvolverNode` can only replay a fixed impulse response; this is the algorithm
itself, so decay, damping and diffusion are live controls.

Nine parameters, and they are the topology's own coefficients rather than a
simplified front panel. It takes mono or stereo in and always outputs stereo.

## Install

```bash
npm i @synthlet/dattorro-reverb
```

Or `npm i synthlet` for every module at once.

## Usage

```ts
import {
  registerDattorroReverbWorklet,
  DattorroReverb,
} from "@synthlet/dattorro-reverb";

const ac = new AudioContext();
await registerDattorroReverbWorklet(ac);

const reverb = DattorroReverb(ac, {
  decay: 0.8, // long tail
  damping: 0.4, // darken it as it decays
  filter: 0.6, // roll off what goes in
  dryWet: 0.3,
});

source.connect(reverb).connect(ac.destination);
```

## Parameters

| Param             | Default | Range        | Rate   | Meaning                                        |
| ----------------- | ------- | ------------ | ------ | ---------------------------------------------- |
| `filter`          | 0.7     | 0 … 1        | k-rate | Input bandwidth — the one-pole before the tank |
| `inputDiffusion1` | 0.75    | 0 … 1        | k-rate | First input allpass coefficient                |
| `inputDiffusion2` | 0.625   | 0 … 1        | k-rate | Second input allpass coefficient               |
| `decayDiffusion1` | 0.7     | 0 … 0.999999 | k-rate | First tank allpass coefficient                 |
| `decayDiffusion2` | 0.5     | 0 … 0.999999 | k-rate | Second tank allpass coefficient                |
| `decay`           | 0.5     | 0 … 1        | k-rate | Tank loop gain, and so the decay time          |
| `damping`         | 0.25    | 0 … 1        | k-rate | High-frequency loss per trip round the tank    |
| `dryWet`          | 1       | −1 … 1       | k-rate | −1 dry, 0 equal, 1 wet                         |
| `level`           | 0       | 0 … 1        | k-rate | Output trim                                    |

Every one is `k-rate`: they describe the plate, and a plate that changed between
two samples is not a plate. The modulation that keeps the tail from ringing is
internal and moves per sample already.

For a tail you can duck with an envelope, put a native `GainNode` on the wet
return — a per-sample gain _inside_ the feedback path is a modulated resonator
rather than a level control.

A second input channel is used when there is one, and the left channel is fed
to both sides when there isn't. The output is always stereo.

## Credits

Generated from the Faust function `re.dattorro_rev`
([`reverbs.lib`](https://github.com/grame-cncm/faustlibraries/blob/master/reverbs.lib))
by Jakob Zerbian, declared under the STK-4.3 licence. It implements the reverb
described in Jon Dattorro, _Effect Design Part 1: Reverberator and Other
Filters_, JAES 45(9), 1997.

Full notice in [LICENSE.md](LICENSE.md) and in the repository's
[THIRD-PARTY-LICENSES.md](https://github.com/danigb/synthlet/blob/main/THIRD-PARTY-LICENSES.md).

## License

MIT © [danigb](https://github.com/danigb)
