---
"@synthlet/clock": patch
---

Extract the clock engine into `src/dsp.ts` as `createClock(sampleRate)`. Internal
refactor with no behaviour change: the output is byte-identical, and the existing
worklet tests pass unmodified. It takes the sample rate as an argument rather than
reading the worklet global, so the module can be measured in node at any rate —
which is what the timing work in this package needs.
