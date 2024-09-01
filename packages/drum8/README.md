# @synthlet/drum8

> Drum8 generator module for [synthlet](https://github.com/danigb/synthlet)

```ts
import { registerDrum8WorkletOnce, createWhiteDrum8 } from "@synthlet/drum8";

const audioContext = new AudioContext();

await registerDrum8WorkletOnce(audioContext);

const kick = createDrum8(audioContext, {
  type: "kick",
});

kick.connect(audioContext.destination);
```

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

You need to register the audio worklet once before creating any drum8 worklet node:

```ts
import { registerDrum8WorkletOnce } from "@synthlet/drum8";
const context = new AudioContext();
await registerDrum8WorkletOnce(context);
```
