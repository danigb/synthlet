# @synthlet/noise

> Noise generator module for [synthlet](https://github.com/danigb/synthlet)

```ts
import { registerNoiseWorkletOnce, createWhiteNoise } from "@synthlet/noise";

const audioContext = new AudioContext();

await registerNoiseWorkletOnce(audioContext);

const noise = createWhiteNoise();
noise.connect(audioContext.destination);
```

## Install

```
npm i @synthlet/noise
```
