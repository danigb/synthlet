# @synthlet/lfo

> [LFO](https://en.wikipedia.org/wiki/Low-frequency_oscillation) generator module for [synthlet](https://github.com/danigb/synthlet)

```ts
import { registerLfoWorklet, createLfo } from "synthlet"; // or "@synthlet/lfo";

const audioContext = new AudioContext();
await registerLfoWorklet(audioContext);

// Create a destination node
const osc = new OscillatorNode(audioContext, { frequency: 440 });

// Create the low frequency oscillator
const lfo = createLfo(audioContext, {
  type: "RandSampleAndHold"
  gain: 10,
  frequency: 1,
});

// Connect to destination parameter
lfo.connect(osc.frequency);
```

## Install

Full package:

```bash
npm i synthlet
```

Just this module:

```bash
npm i @synthlet/lfo
```

## Usage

You need to register the audio worklet before creating any instrument. See [/README.md#register] for details.

## Credits

`concaveTransform` is the MMA concave transform as presented by
[Will Pirkle](https://www.willpirkle.com/) (Tritone Systems) in *Designing
Software Synthesizer Plug-Ins in C++* and SynthLab, including the 5.0/12.0
correction coefficient.

See the repository's
[THIRD-PARTY-LICENSES.md](https://github.com/danigb/synthlet/blob/main/THIRD-PARTY-LICENSES.md).
