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
// `steps: 8, beats: 3` are the defaults, so `Euclid(ac, { clock })` is this.

const kick = KickDrum(ac, { trigger: rhythm }); // x . . x . . x .
const hat = HiHatDrum(ac, { trigger: rhythm.rests }); // . x x . x x . x
kick.connect(ac.destination);
hat.connect(ac.destination);

rhythm.dispose(); // disposes the rests gain with it
```

## Two outputs

| Output          | What it is                                                                |
| --------------- | ------------------------------------------------------------------------- |
| the node itself | the pattern's hits — a pulse over the first `pulseWidth` of each hit step |
| `.rests`        | the steps the hits leave empty — same width, same samples                 |

**The complement of a Euclidean rhythm is a Euclidean rhythm.** That is
Morrill's Lemma 3 — _"Euclidean rhythms distribute their rests in the same
manner as their notes"_ — so `.rests` is `E(steps - beats, steps)` at some
rotation, verified over all 2016 pairs with `1 ≤ beats < steps ≤ 64`. It is a
rhythm, not a leftover.

**It is an output rather than a second node because that rotation is never 0.**
In the same 2016 pairs, not once is the complement `E(steps - beats, steps)` as
generated — every one of them is rotated:

| pattern   | complement         | is `E(n−k, n)` rotated by |
| --------- | ------------------ | ------------------------- |
| `E(3,8)`  | `.xx.xx.x`         | 5                         |
| `E(5,16)` | `.xxx.xx.xx.xx.xx` | 3                         |
| `E(7,12)` | `.x.x.x..x.x.`     | 5                         |

So a second `Euclid` at `beats: steps - beats` plays the right necklace from
the wrong place — it collides with the first instead of interlocking — and
there is no rotation value to work out by ear.

Both outputs are **one step read twice**: one pattern, one step counter, one
clamped `pulseWidth`, one `reset`. They partition every step — never both,
never neither — and they cannot skew or drift. `steps: 0` is silence on both.

**The complement is dense, and that is correct.** `E(3,8)`'s rests are five
hits in eight, `E(5,16)`'s are eleven in sixteen: sparse kick, busy hat. It is
_not_ a second layer of the same pattern — onsets move rather than accumulate —
and the pairing it is for is exactly the one above.

`.rests` adds **no parameters**. Every parameter below applies to both outputs.
The gain node behind it is created with the node whether or not you connect to
it, the way `Clock`'s three are, so it is one idle `GainNode` per `Euclid`
rather than nothing.

## Parameters

| Param         | Default | Range   | Rate   | Meaning                                                  |
| ------------- | ------- | ------- | ------ | -------------------------------------------------------- |
| `clock`       | 0       | 0 … 1   | a-rate | A phase ramp. Its wrap is the step boundary              |
| `steps`       | 8       | 0 … 100 | k-rate | Length of the cycle                                      |
| `beats`       | 3       | 0 … 100 | k-rate | How many of those steps are hits                         |
| `subdivision` | 1       | 1 … 20  | k-rate | Pattern cycles per clock cycle — a multiplier on `clock` |
| `rotation`    | 0       | 0 … 100 | k-rate | How far the pattern is rotated                           |
| `pulseWidth`  | 0.5     | 0 … 1   | k-rate | How much of each step a hit is high for¹                 |
| `reset`       | 0       | 0 … 1   | a-rate | Rising edge makes the next step boundary step 0          |

`clock` is `a-rate`, so a step boundary lands on its own sample rather than at
the top of the next render quantum.

The ramp is read modulo 1 once `subdivision` has scaled it, so a `clock` of
exactly 1 is the top of the ramp read as the bottom of the next step — the same
phase as 0. `@synthlet/clock` emits `[0, 1)` and never reaches it, but `clock` is
an ordinary `AudioParam` and anything can be patched in.

The other five are structural: `steps`, `beats` and `rotation` are one
Euclidean pattern, generated and cached when any of them changes — rotating a
pattern is choosing a different pattern, not interpolating toward one. All three
are counts, so all three are floored: they arrive from an `AudioParam` as
floats, and half a step is not a step.

**`steps` and `beats` default to the tresillo**, `E(3, 8)`, so
`Euclid(ac, { clock })` with nothing else patched plays a rhythm. **`steps: 0`
is legal and means silence** — the honest reading of "a pattern with no steps" —
and so is **`beats: 0`**, for the same reason: a rhythm with no beats has
nothing to play. (`beats: 0` used to emit one hit on step 0 of every cycle.)
`beats` at or above `steps` is every step.

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

## The generator

The pattern is **Morrill's construction** (2022, §4), which builds the rhythm
from the descents of the residue row `n_i = (beats · i) mod steps`: step _i_ is
a hit when adding `beats` wrapped past `steps`. That is one comparison per step,
in integers — the whole generator is

```ts
pattern[i] = (i * beats) % steps < beats ? 1 : 0;
```

and Morrill's Lemma 2 ("exactly _k_ notes") and Corollary 2 ("gcd(_k_, _N_) is
the number of occurrences of the minimal period") are asserted over every
declared setting, `0 ≤ beats ≤ steps ≤ 100`. It is the same construction as
Bjorklund's recursive algorithm — the two are checked against each other over
all 528 rhythms with `steps ≤ 32` — and, before 0.3.0, the same construction
this module always used, evaluated in accumulated float instead of integers.
That cost exactness at 39 settings inside the declared range, all of them at
`steps ≥ 44`.

**Where a Euclidean rhythm starts is not arithmetic.** The generated pattern is
Bjorklund's up to rotation, and a necklace has no canonical starting point:
Toussaint's published rhythms enter the cycle wherever their traditions enter
it, and no rotation rule tested against them reproduces more than 13 of his 22
— which is what this generator already gets. `rotation` is how you choose a
starting point, and it is step-indexed.

## References

- G. T. Toussaint,
  [_The Euclidean Algorithm Generates Traditional Musical Rhythms_](https://archive.bridgesmathart.org/2005/bridges2005-47.pdf),
  Bridges 2005 — the survey that named these rhythms, Bjorklund's algorithm, and
  the necklace framing that says a rhythm has no canonical origin
- T. Morrill,
  [_On The Euclidean Algorithm: Rhythm Without Recursion_](https://arxiv.org/abs/2206.12421),
  arXiv:2206.12421, 2022 — §4 is the generator in this package, Lemma 2 and
  Corollary 2 are what its tests assert, and Lemma 3 is why `.rests` is a
  rhythm

## License

MIT © [danigb](https://github.com/danigb)
