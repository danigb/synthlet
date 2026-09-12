---
"@synthlet/level-meter": patch
---

Add the test harness the package never had, and rename its files to the house
layout.

`packages/level-meter/` was the only audited package with no test file and no
`"test"` script, and its filenames were inverted against every other package —
the hand-written source was `src/processor.ts` and the generated bundle
`src/_processor.ts`. They are now `src/worklet.ts` and `src/processor.ts` like
the other twenty-two, and `.github/workflows/test.yml` loses the special case it
carried to accommodate the inversion.

Internal refactor with no behaviour change. The harness stubs
`AudioWorkletProcessor` and drives `process()` directly, and five of its
assertions are written against intended behaviour the shipped processor does not
have yet — instant attack, a fall rate derived from `sampleRate`, a decay that
runs on an unconnected input, and a pass-through that does not drop channels 9
and up. Each names the ticket that makes it pass.
