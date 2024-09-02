# @synthlet/drum8

> Drum8 generator module for [synthlet](https://github.com/danigb/synthlet)

```ts
import { registerDrum8WorkletOnce, createDrum8 } from "@synthlet/drum8";

const audioContext = new AudioContext();

await registerDrum8WorkletOnce(audioContext);

const kick = createDrum8(audioContext, "kick", {
  decay: 0.2, // time in seconds
  tone: 0.8, // number between [0-1]
  snap: 0.2, // number between [0-1]
});

kick.connect(audioContext.destination);
```

Available instruments (wip): `kick`, `snare`

## Install

Full package:

```bash
npm i synthlet
```

Just this module:

```bash
npm i @synthlet/drum8
```

## Usage

You need to register the audio worklet before creating any instrument. See [/README.md#register] for details.

#### Create an instrument

Use the `createDrum8` function:

```ts
import { createDrum8 } from "synthlet"; // or "@synthlet/drum8"

const kick = createDrum8(audioContext, "kick", {
  decay: 0.2, // time in seconds
  tone: 0.8, // number between [0-1]
  snap: 0.2, // number between [0-1]
});

kick.connect(audioContext.destination);
```

The second parameter is the instrument type. Available instruments (wip) are: `kick`, `snare`.

The third is optional parameters:

- `attack`: attack time in seconds
- `decay`: decay time in seconds
- `level`: volume of the synth (log scale in [0,1] interval where 0 is silence and 1 is 0dB)
- `tone`: tone of the synth ([0,1] interval)
- `snap`: snap sound of the synth ([0,1] interval)

## References

Some parts of this package are based on:

- https://github.com/vincentriemer/io-808
- https://paulbatchelor.github.io/sndkit/env
- https://github.com/nick-thompson/drumsynth

Thanks! :heart:

## Licenses
