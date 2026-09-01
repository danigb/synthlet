---
"@synthlet/ad": minor
"@synthlet/adsr": minor
"@synthlet/arp": minor
"@synthlet/chorus": minor
"@synthlet/clip-amp": minor
"@synthlet/clock": minor
"@synthlet/dattorro-reverb": minor
"@synthlet/euclid": minor
"@synthlet/granite": minor
"@synthlet/impulse": minor
"@synthlet/karplus-strong": minor
"@synthlet/level-meter": minor
"@synthlet/lfo": minor
"@synthlet/lookahead-limiter": minor
"@synthlet/noise": minor
"@synthlet/param": minor
"@synthlet/polyblep-oscillator": minor
"@synthlet/reverb-delay": minor
"@synthlet/state-variable-filter": minor
"@synthlet/virtual-analog-filter": minor
"@synthlet/wavetable-oscillator": minor
"synthlet": minor
---

Every module factory now carries the list of parameters its processor
registers, as `X.descriptors`:

```ts
import { AdsrEnv, type ParamDescriptor } from "@synthlet/adsr";

for (const p of AdsrEnv.descriptors) {
  // { name, defaultValue, minValue, maxValue, automationRate }
  slider(p.name, p.minValue, p.maxValue, p.defaultValue);
}
```

Until now a module's ranges existed only inside the compiled processor string,
where the main thread could not see them: building a slider meant guessing.
The list is the same one the processor registers - there is exactly one per
module now, where before the names were written twice (in the worklet and
again in the factory) with nothing checking they agreed. `ParamDescriptor` is
exported from every package, and the native wrappers `Gain`, `Oscillator` and
`BiquadFilter` in `synthlet` carry `descriptors` too, so a compound author sees
one shape for every node.

Two consequences of the single list, both fixes:

- **`DattorroReverb` exposes `dryWet` and `level`.** The processor has always
  declared and read them; the factory listed neither, so two working
  `AudioParam`s were unreachable. `dryWet` is -1 dry, 0 equal, 1 wet.
- **`Euclid`'s `subdivision` is spelled correctly.** `EuclidInputs` and
  `EuclidWorkletNode` said `subdivison`, so `Euclid(ac, { subdivison: 4 })` was
  silently ignored and `node.subdivison` was `undefined`. Passing
  `subdivision` now works; the misspelled field is gone.

No parameter's default, minimum or maximum changed.
