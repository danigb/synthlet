---
"@synthlet/euclid": patch
---

Extract the Euclidean rhythm engine into `src/dsp.ts` as `createEuclid()`,
alongside the `euclid()` generator and `rotate()`. Internal refactor with no
behaviour change: a `Clock` -> `Euclid` chain rendered over a 3600-cell
parameter matrix is equal sample-for-sample to the previous build, and the
existing worklet tests pass unmodified.

`worklet.ts` is now the thin processor every other package has. What it buys is
that the module's arithmetic can be asserted in node with no
`AudioWorkletProcessor` stub — which is what the correctness work in this
package needs, and what `clock` and `arp` already had.
