---
"@synthlet/clock": minor
"@synthlet/euclid": minor
---

Add an a-rate `reset` inlet to both modules.

A clock's phase origin was "whenever the node was constructed" and nothing could
change it. Two clocks built 37 blocks apart hold that 4736-sample offset for as
long as they live — they do not drift, so nothing self-corrects, and they never
converge. One level down it is sharper: each `Euclid` keeps a private step counter
starting when that node was built, and measured across 32 birth offsets, 28 give
two `Euclid`s on one clock playing different rotations of the same `E(3,8)`.

On `Clock`, a rising edge returns the phase to 0 on that sample. On `Euclid`, it
makes the next step boundary step 0 of the pattern. Both are `a-rate`, so a reset
lands on its own sample rather than at the top of the next render quantum and two
resets inside one block are two resets, and both are edge triggered — holding the
inlet high does not pin the phase.

```ts
const clock = Clock(ac, { bpm: 120 });
const a = Euclid(ac, { clock, steps: 8, beats: 3, reset: someGate });
const b = Euclid(ac, { clock, steps: 16, beats: 5, reset: someGate });
// both start their step 0 on the same beat, however they were built
```

This is the mechanism and not a policy: there is no transport, no master clock and
no implicit global timeline, and two nodes still free-run independently unless you
wire them together. There is no `run` inlet either — `bpm: 0` already stops a
clock.
