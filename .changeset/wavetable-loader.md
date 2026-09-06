---
"@synthlet/wavetable-oscillator": minor
---

Rewrite the WAV loader, and make the catalog overridable.

The reader parsed at hardcoded byte offsets — format at 20, bits at 34, samples
from 44 — which is correct for exactly one flavour of WAV file. Driven with
generated files of each common variant it returned **wrong samples, with no
exception raised**, for four of them:

| input                                                         | before                                                | now     |
| ------------------------------------------------------------- | ----------------------------------------------------- | ------- |
| `LIST` chunk before `data`                                    | 6 samples of metadata read as audio                   | correct |
| `fact` chunk before `data` (**required by spec** for non-PCM) | 2 samples out of 8                                    | correct |
| 24-bit PCM                                                    | a different waveform at a different amplitude         | correct |
| 32-bit integer PCM                                            | `2.0`, `-409686835200`, and `NaN` for any loud sample | correct |
| 32-bit IEEE float                                             | `Invalid format. Only PCM supported.`                 | correct |
| 8-bit PCM                                                     | `Offset is outside the bounds of the DataView`        | correct |
| `WAVE_FORMAT_EXTENSIBLE`                                      | `Invalid format. Only PCM supported.`                 | correct |

It now walks the RIFF chunk list, pad byte included, and picks the sample reader
from the `fmt ` tag rather than from the bit depth — the old `isFloat = bits ===
32` sat after a `format !== 1` guard, so it could only ever be true for integer
PCM, and `getFloat32` over an int32 bit pattern is `NaN` for anything at or above
0.996 of full scale. Supported: PCM at 8, 16, 24 and 32 bits, IEEE float at 32
and 64, either of them wrapped in `WAVE_FORMAT_EXTENSIBLE`. Everything else
throws with the tag, the depth, the channel count or the missing chunk named.

A file whose sample count is not a whole number of frames is now an error rather
than a silently mis-framed table — every plane boundary and every pitch depends
on that number and nothing checked it.

**The catalog is a value now, not a URL literal in two files.** It defaults to
the same WaveEdit Online mirror, which is **a third party's GitHub Pages site**,
and that is exactly why it is overridable — `docs/vision.md` requires every URL
in the library to be self-hostable:

```ts
const osc = WavetableOscillator(ac, { catalog: "/wavetables" });
osc.catalog = { url: (name) => bundled[name], names: async () => [...] };
await osc.loadWavetable("/tables/my-own.wav"); // a URL needs no catalog
```

**Breaking:** `loadWavetable(nameOrUrl, wavetableLength)`'s second argument is
now an options object, `{ length, catalog }`. `node.loadWavetable(name,
options)` is unchanged and its options widen from `ConditionOptions` to
`ConditionOptions & { length, catalog }`. `WavetableLoader` is gone, replaced by
the free functions `decodeWav`, `decodeWavetable`, `fetchWavetable`,
`waveditCatalog` and `toCatalog`, all exported.

Every failure path now rejects a promise that carries a real message, and the
site demo displays it instead of dropping it. `wavetable-loader.ts` had no test
file at all; it has 41 now, generating each WAV variant in-test rather than
committing fixtures.
