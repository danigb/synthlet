# @synthlet/reverb-delay

> Greyhole: a diffusing delay that is also a reverb

Part of [Synthlet](https://github.com/danigb/synthlet).

A delay network with allpass diffusion and modulated taps in the loop — sits
between a delay and a reverb and does not commit to either. Short `delay` with
high `feedback` gives a smeared echo; long `size` with high `diffusion` gives a
tail that never quite settles. The modulation in the loop is what stops it
ringing on one pitch.

It takes mono or stereo in and always outputs stereo.

## Install

```bash
npm i @synthlet/reverb-delay
```

Or `npm i synthlet` for every module at once.

## Usage

```ts
import {
  registerReverbDelayWorklet,
  ReverbDelay,
} from "@synthlet/reverb-delay";

const ac = new AudioContext();
await registerReverbDelayWorklet(ac);

const space = ReverbDelay(ac, {
  delay: 0.4,
  size: 2,
  feedback: 0.85,
  diffusion: 0.7,
  damping: 0.4,
});

source.connect(space).connect(ac.destination);
```

## Parameters

| Param       | Default | Range        | Rate   | Meaning                                                  |
| ----------- | ------- | ------------ | ------ | -------------------------------------------------------- |
| `delay`     | 0.2     | 0.001 … 1.45 | k-rate | Seconds of pre-delay before the network                  |
| `damping`   | 0.3     | 0 … 0.99     | k-rate | High-frequency loss per round trip                       |
| `size`      | 1       | 0.1 … 3      | k-rate | Multiplier on every delay length — how large the room is |
| `diffusion` | 0.5     | 0 … 0.99     | k-rate | Allpass coefficient: how smeared each reflection is      |
| `feedback`  | 0.9     | 0 … 1        | k-rate | Loop gain, and so the decay time                         |
| `modDepth`  | 0.1     | 0 … 1        | k-rate | How far the internal LFOs move the taps                  |
| `modFreq`   | 2       | 0 … 10       | k-rate | How fast those LFOs run, in Hz                           |

Every one is `k-rate`. A reverb is a _space_, and a space that changed between
two samples is not a space: each value becomes a coefficient or a delay length
for the whole network, once per block. The engine's own LFOs are what move per
sample.

Changing `delay` per sample would pitch-shift the tail rather than move the
room — that is what [`@synthlet/analog-delay`](https://github.com/danigb/synthlet/tree/main/packages/analog-delay)
does on purpose. To duck the tail with an envelope, put a native `GainNode` on
the wet return rather than automating `feedback`, which lives inside the
feedback path.

A second input channel is used when there is one, and the left channel is fed
to both sides when there isn't. The output is always stereo.

## Credits

Generated from the Faust function `re.greyhole`
([`reverbs.lib`](https://github.com/grame-cncm/faustlibraries/blob/master/reverbs.lib)),
declared as "Julian Parker, bug fixes and minor interface changes by Till
Bovermann", MIT licensed.

Full notice in [LICENSE.md](LICENSE.md) and in the repository's
[THIRD-PARTY-LICENSES.md](https://github.com/danigb/synthlet/blob/main/THIRD-PARTY-LICENSES.md).

## License

MIT © [Daniel Gómez Blasco](https://github.com/danigb)
