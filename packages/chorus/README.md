# @synthlet/chorus

> A multi-voice stereo chorus, as an audio worklet

Part of [Synthlet](https://github.com/danigb/synthlet).

Several delayed copies of the input, each read at a position its own LFO moves,
summed to a stereo pair. Mono in, stereo out — the width comes from spreading
the voices' LFOs apart rather than from panning.

All four controls are normalised **0…1 knob positions**, not physical
quantities: this is a pedal, not a modular utility.

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

const chorus = Chorus(ac, {
  delay: 0.5,
  rate: 0.3,
  depth: 0.6,
  deviation: 0.5,
});

source.connect(chorus).connect(ac.destination);
```

## Parameters

| Param       | Default | Range | Rate   | Meaning                                               |
| ----------- | ------- | ----- | ------ | ----------------------------------------------------- |
| `delay`     | 0.5     | 0 … 1 | k-rate | Where the moving read position is centred             |
| `rate`      | 0.5     | 0 … 1 | k-rate | How fast the internal LFOs run                        |
| `depth`     | 0.5     | 0 … 1 | k-rate | How far they swing                                    |
| `deviation` | 0.5     | 0 … 1 | k-rate | How far the voices are spread apart in phase and rate |

All four are `k-rate` and handed to the engine's per-block update — **the
engine's own LFOs are what move per sample**, which is what makes this a chorus
rather than a delay you have to modulate yourself.

**Only the first input channel is read**, and the output is always stereo.

## Credits

The DSP is compiled from Faust. The committed Faust source
(`dsp/chorus.dsp`, not published to npm) contains a `chorus_mono` definition
copied from the Faust distribution's `examples/SAM/chorus/chorusForBrowser.dsp`,
Copyright (C) 2003-2024 GRAME, Centre National de Creation Musicale and
(C) 2023-2024 INRIA, LGPL 2.1-or-later.

See the repository's
[THIRD-PARTY-LICENSES.md](https://github.com/danigb/synthlet/blob/main/THIRD-PARTY-LICENSES.md).

## License

MIT © [danigb](https://github.com/danigb)
