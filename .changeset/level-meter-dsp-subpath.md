---
"@synthlet/level-meter": minor
"@synthlet/lookahead-limiter": minor
---

Split the meter's arithmetic out of the worklet, publish it at `./dsp`, and add
an offline driver over it.

Everything the meter measured was locked inside an `AudioWorkletProcessor`,
which cost three things: it could not be tested without the stub, it could not
reuse `lookahead-limiter`'s true-peak detector behind the same wall, and it
could not run offline — and "tell me the level of this file" is at least as
common an ask as "put a bar on my graph".

`src/dsp.ts` is now the whole of it, pure: `sampleRate` is an argument, samples
arrive as `Float32Array[]`, and the readings go into a plain typed array. That
is the house shape every other mature package already has. `worklet.ts` is a
driver that calls it once per render quantum; `offline.ts` is a driver that
calls it over chunks. **The extraction changed no behaviour, and the worklet
suite passing unmodified is what says so.**

```ts
import { analyze, createLevelAnalyzer } from "@synthlet/level-meter/dsp";

const analysis = await analyze(channels, 48000, { onProgress });
analysis.peak; // dBFS, the highest anywhere in the buffer
analysis.clipped; // per channel
```

The ballistics run on a fixed 128-sample frame — the render quantum — and
`process()` carries a partial frame across calls, so **how a caller chunks the
audio cannot move a reading**. Offline and realtime therefore leave the layout
buffer in byte-identical states over the same samples, which is asserted rather
than assumed. `analyze()` yields to the host between chunks, because true peak
costs seconds where the rest of the meter costs milliseconds — roughly 3.3 s of
CPU for a five-minute track against 181 ms with loudness on — and a run of that
length in one go is a frozen tab. Input that is not `Float32Array` — a `Float64Array` from a decoder, a plain
`number[]` — is rounded to Float32 first, so the answer is the one the realtime
path would have given rather than a slightly better one.
`analyzeAudioBuffer(buffer)` is the adapter, and it lives in the offline entry
rather than the core so the core still runs in node, in jest and in a worker.

**Both packages gain an `exports` map with `.` and `./dsp`** — the first in the
repository, and the pattern for every package that follows. `main`, `module` and
`types` are kept alongside it so nothing that resolves the old way breaks. A
`synthlet-source` condition on `./dsp` points at the TypeScript source, which is
what lets one package's worklet bundle another's DSP inside the monorepo with no
build ordering; published consumers never see it. `@synthlet/lookahead-limiter/dsp`
exports `createTruePeakDetector`, so the meter can measure dBTP with the
limiter's own interpolator instead of a second copy of it.

`./dsp` must not drag the minified worklet in behind it — an offline-only
consumer should not carry a `PROCESSOR` string they will never register. That is
a test, not a comment: it bundles the entry and asserts the string is absent.
