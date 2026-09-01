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

## Credits

The pink noise generator implements ["A New Shade of
Pink"](https://www.ridgerat-tech.us/pink/newpink.htm) by Larry Trammell,
(c) Larry Trammell 2016-2020, licensed under [Creative Commons Attribution 4.0
International](https://creativecommons.org/licenses/by/4.0/).

Full notice in [LICENSE.md](LICENSE.md) and in the repository's
[THIRD-PARTY-LICENSES.md](https://github.com/danigb/synthlet/blob/main/THIRD-PARTY-LICENSES.md).
