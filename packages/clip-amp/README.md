# @synthlet/clip-amp

> A two-gain-stage amplifier with a saturating curve between them

Part of [Synthlet](https://github.com/danigb/synthlet).

`postGain × clip(preGain × input)`. Drive into the curve, a make-up trim after
it, and a choice of curve — the smallest useful distortion stage, and the piece
Web Audio's `WaveShaperNode` makes awkward because its curve is a sampled table
rather than a function you drive.

## Install

```bash
npm i @synthlet/clip-amp
```

Or `npm i synthlet` for every module at once.

## Usage

```ts
import { registerClipAmpWorklet, ClipAmp, ClipType } from "@synthlet/clip-amp";

const ac = new AudioContext();
await registerClipAmpWorklet(ac);

const drive = ClipAmp(ac, {
  type: ClipType.Tanh,
  preGain: 4, // into the curve
  postGain: 0.5, // back down after it
});

osc.connect(drive).connect(ac.destination);
```

## Parameters

| Param      | Default | Range  | Rate   | Meaning                                      |
| ---------- | ------- | ------ | ------ | -------------------------------------------- |
| `type`     | 0       | 0 … 1  | k-rate | `ClipType.Bypass` (0) or `ClipType.Tanh` (1) |
| `preGain`  | 1       | 0 … 10 | k-rate | Drive into the curve                         |
| `postGain` | 1       | 0 … 10 | k-rate | Make-up trim after it                        |

All three are `k-rate`. `type` selects a function, so crossing between two of
them mid-block would splice rather than interpolate. The two gains are k-rate
by choice rather than by necessity: a native `GainNode` in front of or behind
this node does the same job at a-rate and costs nothing.

Every channel of the input is clipped, so a stereo signal stays stereo.

## License

MIT © [Daniel Gómez Blasco](https://github.com/danigb)
