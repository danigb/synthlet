# Synthlet

[MikaMicro synthesizer](https://github.com/tesselode/mika-micro) ported to the web:

```ts
import { Mika } from "synthlet";

const context = new AudioContext();
const synth = new Mika(context);
await synth.loaded();

synth.setNote(60);
synth.start(context.currentTime);
synth.setNote(62, context.currentTime + 0.5);
synth.release(context.currentTime + 1);
```

The synthetizer is implemented as an AudioWorklet node.
