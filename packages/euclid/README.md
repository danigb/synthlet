# @synthlet/euclid

> A Euclidean rhythm generator, as an audio worklet

Part of [Synthlet](https://github.com/danigb/synthlet).

Distribute `beats` hits as evenly as possible over `steps` steps and you get
most of the world's rhythms — `(3, 8)` is the tresillo, `(5, 8)` the cinquillo,
`(5, 16)` the bossa-nova necklace. This is that pattern, driven by a clock and
emitted as gate pulses ready for a drum voice or an envelope.

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

The pattern is also a value. `Euclid.pattern(steps, beats, rotation)` returns
the array the node is playing, with no `AudioContext` and nothing registered —
which is how you find out that the cinquillo is `rotation: 6`, because no rule
will tell you. `EuclidRhythm` is the table of the ones that have names:

```ts
import { Euclid, EuclidRhythm } from "@synthlet/euclid";

Euclid.pattern(8, 3); // [1,0,0,1,0,0,1,0] — the tresillo
Euclid.pattern(8, 5, 6); // [1,0,1,1,0,1,1,0] — the cinquillo
Euclid(ac, { clock, ...EuclidRhythm.Cinquillo }); // the same three numbers, named
```

See [Named rhythms](#named-rhythms).

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

## Named rhythms

```ts
import { Euclid, EuclidRhythm } from "@synthlet/euclid";

Euclid.pattern(8, 5, 6); // [1,0,1,1,0,1,1,0] — the cinquillo
Euclid(ac, { clock, ...EuclidRhythm.Cinquillo });
Euclid(ac, { clock, subdivision: 4, ...EuclidRhythm.BossaNova });
```

**`rotation: 0` is not the named rhythm, and no rule says which rotation is.**
Of the 22 rhythms Toussaint 2005 §4 publishes, 13 come out right at
`rotation: 0` and 9 do not — and no stated rotation rule reproduces more than
13 (lexicographically-largest gets 5, lex-smallest-starting-on-an-onset gets 13,
biggest-gap-last gets 6, and this generator already gets 13). A necklace
_"disregards the starting point in the cycle"_; where a tradition enters it is
ethnomusicology, not arithmetic. So the values below were looked up, not
derived, and this is the table.

Every row is asserted against the paper's own box notation in
`src/dsp.test.ts`, three ways: against §5's interval vector, against a reference
Bjorklund, and against what `Euclid.pattern` returns. **If the table and the
paper disagree, the paper wins.** A test also parses this markdown, so the table
you are reading and the object that ships cannot drift.

`Euclid.pattern(steps, beats, rotation)` is the same expression the engine
rebuilds its pattern from, so it is the pattern the node plays and not a
reconstruction of it. It is pure and control-thread — no `AudioContext`, no
worklet, callable in node — so it also draws: a ring of LEDs is
`Euclid.pattern(...).map(...)`.

| Name                     | E(k,n)   | rotation | pattern                    | Where it comes from                                                       |
| ------------------------ | -------- | -------: | -------------------------- | ------------------------------------------------------------------------- |
| `Tresillo`               | E(3,8)   |        0 | `x..x..x.`                 | Cuban tresillo, and the habanera                                          |
| `Cinquillo`              | E(5,8)   |        6 | `x.xx.xx.`                 | Cuban cinquillo                                                           |
| `BossaNova`              | E(5,16)  |       12 | `x..x..x..x..x...`         | Bossa-Nova necklace, Brazil                                               |
| `Samba`                  | E(7,16)  |        0 | `x..x.x.x..x.x.x.`         | Samba necklace, Brazil                                                    |
| `AshantiMpre`            | E(7,12)  |        8 | `x.xx.x.xx.x.`             | West African bell pattern; the Mpre rhythm of the Ashanti people of Ghana |
| `CentralAfricanRepublic` | E(9,16)  |       10 | `x.xx.x.x.xx.x.x.`         | A rhythm necklace of the Central African Republic                         |
| `AkaPygmy`               | E(11,24) |        0 | `x..x.x.x.x.x..x.x.x.x.x.` | A rhythm necklace of the Aka Pygmies of Central Africa                    |
| `Venda`                  | E(5,12)  |        0 | `x..x.x..x.x.`             | Venda clapping pattern, a South African children's song                   |
| `KhafifERamal`           | E(2,5)   |        2 | `x.x..`                    | Khafif-e-ramal, a 13th century Persian rhythm; Tchaikovsky's Sixth, II    |
| `Ruchenitza`             | E(3,7)   |        4 | `x.x.x..`                  | Ruchenitza, a Bulgarian folk-dance; Pink Floyd's _Money_                  |
| `Aksak`                  | E(4,9)   |        6 | `x.x.x.x..`                | The Aksak rhythm of Turkey; Brubeck's _Rondo a la Turk_                   |
| `Moussorgsky`            | E(5,11)  |        8 | `x.x.x.x.x..`              | The metre of _Pictures at an Exhibition_                                  |
| `Cumbia`                 | E(3,4)   |        0 | `x.xx`                     | Cumbia, Colombia; a Calypso rhythm from Trinidad                          |
| `Tuareg`                 | E(7,8)   |        0 | `x.xxxxxx`                 | Played on the Bendir by the Tuareg people of Libya                        |
| `AkaPygmyUpperSangha`    | E(13,24) |       14 | `x.xx.x.x.x.x.xx.x.x.x.x.` | A rhythm necklace of the Aka Pygmies of the upper Sangha                  |
| `Zappa`                  | E(4,11)  |        0 | `x..x..x..x.`              | The metre of Frank Zappa's _Outside Now_                                  |

### The rhythm as played

**These are necklaces.** For five of them Toussaint distinguishes the necklace
from the rhythm as it is actually played — _"the actual Bossa-Nova rhythm
usually starts on the third onset"_, _"started on the fifth onset it is a
clapping pattern from Ghana"_ — and there are several played variants per
necklace. The presets above take one entry point each, the published E(k,n); the
rest are here, and they are exactly the material a fan of rotations would be
built from.

| The paper says                                                                                    | rotation | pattern                    |
| ------------------------------------------------------------------------------------------------- | -------: | -------------------------- |
| E(5,16) "the actual Bossa-Nova rhythm usually starts on the third onset"                          |        6 | `x..x..x...x..x..`         |
| E(5,16) "other starting places as well, as for example"                                           |        9 | `x..x..x..x...x..`         |
| E(7,16) "the actual Samba rhythm... starting E(7,16) on the last onset"                           |        2 | `x.x..x.x.x..x.x.`         |
| E(7,16) "started on the fifth onset it is a clapping pattern from Ghana"                          |        6 | `x.x.x.x..x.x.x..`         |
| E(9,16) "started on the fourth onset... West and Central Africa, and the Brazilian samba cowbell" |        5 | `x.x.xx.x.x.x.xx.`         |
| E(9,16) "started on the penultimate onset... the Ngbaka-Maibo bell"                               |       14 | `x.x.x.xx.x.x.xx.`         |
| E(11,24) "usually started on the seventh onset"                                                   |       10 | `x.x.x.x.x.x..x.x.x.x.x..` |
| E(13,24) "usually started on the fourth onset"                                                    |        9 | `x.x.x.x.xx.x.x.x.x.x.xx.` |
| E(5,8) "started on the second onset... the Spanish Tango"                                         |        4 | `xx.xx.x.`                 |
| E(2,5) "started on the second onset... _Take Five_, and _Mars_"                                   |        0 | `x..x.`                    |

Note the last row: E(2,5) started on its second onset is what this module
already plays at `rotation: 0`. That is the clearest illustration in the file
that the generator's origin is _an_ entry point and not _the_ entry point — the
rhythm you get for free is the one Brubeck counted, and the one the paper names
is two steps away.

Toussaint counts **onsets** and `rotation` counts **steps**; the two tables
above are that translation, done once.

## References

- G. T. Toussaint,
  [_The Euclidean Algorithm Generates Traditional Musical Rhythms_](https://archive.bridgesmathart.org/2005/bridges2005-47.pdf),
  Bridges 2005 — the survey that named these rhythms, Bjorklund's algorithm, and
  the necklace framing that says a rhythm has no canonical origin. §4 is the
  source of every string in the tables above and §5's interval vectors are what
  check them; the tests hold all 22 of its rhythms, not only the 16 that ship
- T. Morrill,
  [_On The Euclidean Algorithm: Rhythm Without Recursion_](https://arxiv.org/abs/2206.12421),
  arXiv:2206.12421, 2022 — §4 is the generator in this package, Lemma 2 and
  Corollary 2 are what its tests assert, and Lemma 3 is why `.rests` is a
  rhythm

## License

MIT © [danigb](https://github.com/danigb)
