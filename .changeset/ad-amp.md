---
"@synthlet/ad": minor
---

Add `AdAmp`: an attack-decay amplifier with one input, the percussive
counterpart of `AdsrAmp`. The output is `input × envelope × gain + offset`,
the same formula the ADSR amplifier uses. It shares the `AdProcessor` with
`AdEnv`, so `registerAdWorklet` covers both.

```ts
const amp = AdAmp(ac, { trigger, attack: 0.01, decay: 0.3 });
osc.connect(amp).connect(ac.destination);
```

An `AdAmp` with nothing connected to its input outputs `offset` (silence by
default) rather than throwing inside the processor.
