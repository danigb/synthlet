# @synthlet/euclid

> A Euclidean rhythm generator, as an audio worklet

Part of [Synthlet](https://github.com/danigb/synthlet).

Distribute `beats` hits as evenly as possible over `steps` steps and you get
most of the world's rhythms — `(3, 8)` is the tresillo, `(5, 8)` the cinquillo,
`(7, 16)` a bossa. This is that pattern, driven by a clock and emitted as
gate pulses ready for a drum voice or an envelope.

It has no tempo of its own. Timing comes in on `clock` as a **phase ramp**, not
a gate: the step boundary is the ramp's wrap, which is what `@synthlet/clock`
puts on its main output.

## Install

```bash
npm i @synthlet/euclid
```

Or `npm i synthlet` for every module at once.

## Usage

```ts
import { registerEuclidWorklet, Euclid } from "@synthlet/euclid";

const ac = new AudioContext();
await registerEuclidWorklet(ac);

const clock = Clock(ac, { bpm: 120 });

const rhythm = Euclid(ac, {
  clock, // the phase ramp, not clock.gate
  steps: 8,
  beats: 3, // the tresillo
  rotation: 0,
});

const kick = KickDrum(ac, { trigger: rhythm });
kick.connect(ac.destination);
```

## Parameters

| Param         | Default | Range   | Rate   | Meaning                                                  |
| ------------- | ------- | ------- | ------ | -------------------------------------------------------- |
| `clock`       | 0       | 0 … 1   | a-rate | A phase ramp. Its wrap is the step boundary              |
| `steps`       | 0       | 0 … 100 | k-rate | Length of the cycle                                      |
| `beats`       | 0       | 0 … 100 | k-rate | How many of those steps are hits                         |
| `subdivision` | 1       | 1 … 20  | k-rate | Pattern cycles per clock cycle — a multiplier on `clock` |
| `rotation`    | 0       | 0 … 100 | k-rate | How far the pattern is rotated                           |
| `pulseWidth`  | 0.5     | 0 … 1   | k-rate | How much of each step a hit is high for¹                 |
| `reset`       | 0       | 0 … 1   | a-rate | Rising edge makes the next step boundary step 0          |

`clock` is `a-rate`, so a step boundary lands on its own sample rather than at
the top of the next render quantum.

The other five are structural: `steps`, `beats` and `rotation` are one
Euclidean pattern, generated and cached when any of them changes — rotating a
pattern is choosing a different pattern, not interpolating toward one.

**A hit is a pulse, not a held level.** Held levels merge adjacent hits — no
falling edge between them means no rising edge for the second — so a `(4, 4)`
pattern would fire exactly once, ever. `pulseWidth` is what makes two adjacent
hits two triggers.

**Two patterns agree only if you say so.** Each `Euclid` keeps a private step
counter that starts at 0 whenever _that node_ was built, so two of them on one
`Clock` play different rotations of the same pattern unless they happened to be
constructed in the same render quantum. Measured across 32 birth offsets, 28
diverge. `reset` is how you say so:

```ts
const clock = Clock(ac, { bpm: 120 });
const a = Euclid(ac, { clock, steps: 8, beats: 3, reset: someGate });
const b = Euclid(ac, { clock, steps: 16, beats: 5, reset: someGate });
// both start their step 0 on the same beat, however they were built
```

Like `Clock`'s, it is `a-rate` and edge triggered: the reset lands on its own
sample, two resets in one block are two resets, and holding it high does not
pin the pattern at step 0.

¹ **`pulseWidth: 1` means "the widest hit that still retriggers"**, not 100 %.
For the same reason: a hit that never falls is a gate that can never fire
again. The width is capped to leave one render quantum of every step low, which
is what a consumer reading its trigger once per block needs in order to see the
falling edge. The cap is derived from the incoming clock's own rate and the
`subdivision` applied to it, so it tracks the tempo, and it is inert at any
width you would ordinarily set.

## License

MIT © [danigb](https://github.com/danigb)
