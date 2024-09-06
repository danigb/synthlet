# @synthlet/noise

> Noise generator module for [synthlet](https://github.com/danigb/synthlet)

```ts
import { registerNoiseWorklet, createWhiteNoise } from "@synthlet/noise";

const audioContext = new AudioContext();

await registerNoiseWorklet(audioContext);

const noise = createWhiteNoise();
noise.connect(audioContext.destination);
```

## Install

```
npm i @synthlet/noise
```
