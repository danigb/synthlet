---
"synthlet": minor
---

Add `registerMonoSynth` and `registerDrums`, so a compound registers only the
worklets it is made of instead of all twenty-one:

```ts
import { registerMonoSynth, MonoSynth } from "synthlet";

const ac = await registerMonoSynth(new AudioContext());
const synth = MonoSynth(ac);
```

`MonoSynth` needs five worklets and the ten drums need six between them;
`registerAllWorklets` was pulling in two reverbs, a granular engine and a
limiter that no compound touches. Both return the context, like
`registerAllWorklets`, and registration is cached per context, so they compose
with each other and with `registerAllWorklets` without registering anything
twice.

`registerAllWorklets` is unchanged, and is still the one-liner for anyone who
wants everything.
