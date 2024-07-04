# @synthlet/noise

> Noise generator module for [synthlet](https://github.com/danigb/synthlet)

```ts
import { registerNoiseWorkletOnce, createWhiteNoise } from "@synthlet/adsr";

const audioContext = new AudioContext();

await registerNoiseWorkletOnce(audioContext);

// Create a VCA (Voltage Controlled Amplifier)
const noise = createWhiteNoise();
// Connect the noise to the output
noise.connect(audioContext.destination);
```

## Install

```
npm i @synthlet/noise
```
