# @synthlet/clock

> A clock synth module implemented as audio worklet

Part of [synthlet](https://github.com/danigb/synthlet) modular synthesis.

```ts
import { registerClockWorklet, createClock } from "synthlet"; // or "@synthlet/clock";

const audioContext = new AudioContext();

await registerClockWorklet(audioContext);
const clock = createClock(audioContext, { bpm: 80 });
```
