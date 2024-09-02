# @synthlet/chorus-t

> Chorus (based on TAL Noisemaker) audio effect

Part of [synthlet](https://github.com/danigb/synthlet) modular synthesis.

```ts
import { registerChorusWorkletOnce, createChorus } from "synthlet"; // or "@synthlet/chorus-t";

const audioContext = new AudioContext();

await registerChorusWorkletOnce(audioContext);

const osc = new Oscillator(audioContext, { frequency: 440 });
osc.start();
const chorus = createChorus(audioContext);

osc.connect(chorus).connect(audioContext.destination);
```

## References

The implementation of this Chorus is based on [TAL-Noisemaker](https://github.com/Nexbit/tal-noisemaker)
