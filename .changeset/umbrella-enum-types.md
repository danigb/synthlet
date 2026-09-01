---
"synthlet": patch
---

Fix the umbrella's published types omitting every enum. `ArpScale`,
`ClipType`, `LfoType`, `NoiseType`, `ParamScaleType`,
`PolyblepOscillatorType` and `SvfType` were exported at runtime and
documented, but appeared nowhere in `dist/index.d.ts`, so this failed to
compile from `synthlet` while the same code compiled from `@synthlet/noise`:

```ts
import { Noise, NoiseType } from "synthlet";

Noise(ac, { type: NoiseType.White }); // TS2305: no exported member 'NoiseType'
```

`tsup`'s declaration bundler drops enums from `export *` re-exports, so the
umbrella now names all seven explicitly. Nothing changed at runtime.
