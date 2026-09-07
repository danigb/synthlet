---
"@synthlet/clock": minor
---

Add `beatsPerBar`, a bar phase on `.bar` and a downbeat gate on `.downbeat`.

Nothing in synthlet could express "the first beat of the bar", and no consumer
could work it out for itself. Subdividing a clock is multiplying its phase — a
pure function of the instantaneous value — but division is not the mirror image:
the bar position is a _count_, and the beat ramp during beat 1 is bit-identical to
the ramp during beat 3, so the information is not in the signal at all. A consumer
that wanted bars would have to count wraps and choose an origin, and two consumers
choosing privately disagree about where bar 1 is, permanently and silently, while
each is individually correct.

```ts
const clock = Clock(ac, { bpm: 120, beatsPerBar: 4 });
Snare(ac, { trigger: clock.downbeat }); // once per bar
Euclid(ac, { clock: clock.bar, subdivision: 8, steps: 8, beats: 3 });
```

Purely additive: outputs 0 and 1 keep their exact meaning, verified
sample-identical to the previous build over 60 s across the tempo and pulse-width
matrix. `.downbeat` is a subset of `.gate` — same width, same phase, same sample.
A clock starts on a downbeat and `reset` returns it to one. `beatsPerBar: 0`
silences both new outputs and divides by nothing.
