# @synthlet/chorus

> Chorus audio effect audio worklet

Part of [synthlet](https://github.com/danigb/synthlet) modular synthesis.

```ts
import { registerChorusWorkletOnce, createChorus } from "synthlet"; // or "@synthlet/chorus";

const audioContext = new AudioContext();

await registerChorusWorkletOnce(audioContext);

const osc = new Oscillator(audioContext, { frequency: 440 });
osc.start();
const chorus = createChorus(audioContext);

osc.connect(chorus).connect(audioContext.destination);
```
