# @synthlet/clock

> A clock synth module implemented as audio worklet

Part of [synthlet](https://github.com/danigb/synthlet) modular synthesis.

```ts
import { registerClockWorkletOnce, createClock } from "synthlet"; // or "@synthlet/clock";

const audioContext = new AudioContext();

await registerClockWorkletOnce(audioContext);
const clock = createClock(audioContext, { bpm: 80 });
```
