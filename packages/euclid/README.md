# @synthlet/euclid

> A Euclidean rhythm generator, as an audio worklet

Part of [Synthlet](https://github.com/danigb/synthlet).

Distribute `beats` hits as evenly as possible over `steps` steps and you get
most of the world's rhythms — `(3, 8)` is the tresillo, `(5, 8)` the cinquillo,
`(5, 16)` the bossa-nova necklace. This is that pattern, driven by a clock and
emitted as gate pulses ready for a drum voice or an envelope. Sixteen of those
rhythms ship [named](#named-rhythms), with the rotation each one is actually
played at, because `rotation: 0` is not it and no rule says which is.

One pattern comes out on **five outputs**: the hits, the steps they leave empty,
and three more entry points into the same necklace, `spread` steps apart. They
share one step counter and one `reset`, so they cannot drift.

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
  spread: 3, // how far apart the fan's four channels are
});
// `steps: 8, beats: 3` are the defaults, so `Euclid(ac, { clock })` is the
// tresillo in unison on every output.

const kick = KickDrum(ac, { trigger: rhythm }); // x . . x . . x .   rotation 0
const hat = HiHatDrum(ac, { trigger: rhythm.rests }); // . x x . x x . x   the steps the kick leaves empty
const tom = TomDrum(ac, { trigger: rhythm.b }); // . x . x . . x .   rotation 3
[kick, hat, tom].forEach((drum) => drum.connect(ac.destination));

rhythm.dispose(); // disposes all four secondary gains with it
```

The pattern is also a value: `Euclid.pattern(8, 3)` is `[1,0,0,1,0,0,1,0]`, the
array this patch is playing. See [Named rhythms](#named-rhythms).

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

## Five outputs

| Output          | What it is                                                                               |
| --------------- | ---------------------------------------------------------------------------------------- |
| the node itself | channel **a** — the pattern's hits, a pulse over the first `pulseWidth` of each hit step |
| `.rests`        | the steps channel a leaves empty — same width, same samples                              |
| `.b`            | the pattern at `rotation + spread`                                                       |
| `.c`            | the pattern at `rotation + 2 × spread`                                                   |
| `.d`            | the pattern at `rotation + 3 × spread`                                                   |

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

The hits and the rests are **one step read twice**: one pattern, one step
counter, one clamped `pulseWidth`, one `reset`. They partition every step —
never both, never neither — and they cannot skew or drift. All five outputs are
read from that same step, so none of them can skew, and `steps: 0` is silence on
every one.

**The complement is dense, and that is correct.** `E(3,8)`'s rests are five
hits in eight, `E(5,16)`'s are eleven in sixteen: sparse kick, busy hat. It is
_not_ a second layer of the same pattern — onsets move rather than accumulate —
and the pairing it is for is exactly the one above.

`.rests` adds **no parameters**, and `spread` is the fan's only one. Every
parameter below applies to every output: there is one width, one clamp, one
step counter and one `reset` behind all five.

The gain nodes behind the four secondary outputs are created with the node
whether or not you connect to them, the way `Clock`'s three are, so it is four
idle `GainNode`s per `Euclid` rather than nothing. That is deliberate and was
reconsidered when this module reached five outputs: `numberOfOutputs` is fixed
when the worklet node is constructed and cannot grow, and the spec hands
`process()` a zero-filled buffer for every declared output whether it is
connected or not — so the per-sample writes happen either way, and all a lazy
getter would defer is three allocations at construction time.

### The fan

**One necklace is several named rhythms at once.** Toussaint keeps saying so:
E(9,16) started on its fourth onset is played in West and Central Africa and is
also the Brazilian samba cowbell; started on its penultimate onset it is the
Ngbaka-Maibo bell pattern. These are not variations on a rhythm — they are the
parts different players hold **simultaneously**, over one cycle.

`spread` is that. Channel _i_ plays `Euclid.pattern(steps, beats, rotation + i × spread)`:

```ts
const rhythm = Euclid(ac, {
  clock,
  subdivision: 4,
  ...EuclidRhythm.Samba,
  spread: 2,
});
KickDrum(ac, { trigger: rhythm }); // x..x.x.x..x.x.x.  rotation 0 — the samba necklace
TomDrum(ac, { trigger: rhythm.b }); // x.x..x.x.x..x.x.  rotation 2 — the samba as played
CongaDrum(ac, { trigger: rhythm.c }); // x.x.x..x.x.x..x.  rotation 4
ClaveDrum(ac, { trigger: rhythm.d }); // x.x.x.x..x.x.x..  rotation 6 — a clapping pattern from Ghana
```

Three of those four are rhythms the paper names, off one setting.

It is the same array read at four offsets, so the four channels share one
pattern, one step counter, one clamped `pulseWidth`, one `gatePulse` and one
`reset`. They cannot drift apart and one `reset` aligns every one of them —
which four separate nodes could not promise.

**`spread: 0` is unison and is the default**, so nothing that does not set it
plays differently. `spread` equal to `steps` is unison again, because _i_ ×
`spread` is then 0 mod `steps` — a consequence of the arithmetic, not a special
case, which is why the range needs no upper bound below `rotation`'s.

**No single `spread` reaches all three of E(9,16)'s published entry points.**
They are rotations 5, 10 and 14 — spaced 5 and 4 — and `spread` gives _evenly
spaced_ entry points. A tradition's entry points are not evenly spaced. That is
the same finding as "there is no canonical origin", one level up: the fan gives
you four places in the necklace at a regular interval, and where a tradition
enters it remains ethnomusicology.

#### Tiling, at one setting

At `steps: 16, beats: 5, spread: 4` the four channels tile the cycle — every
step filled, none struck by more than two of the four voices, no unison
downbeat. That is hocket, and it is a genuinely different texture from four
independent generators:

| design                                  | silent |  1 hit |     2 |     3 |     4 |
| --------------------------------------- | -----: | -----: | ----: | ----: | ----: |
| independent `beats` 4/5/7/9, rotation 0 |      1 |      8 |     5 |     1 |     1 |
| **one pattern, `E(5,16)`, `spread: 4`** |  **0** | **12** | **4** | **0** | **0** |

**Tiling is a property of that setting, not of `spread`.** On the same
`E(5,16)`, `spread: 3` leaves eight of sixteen steps silent and strikes two of
them with all four voices — `8|2|2|2|2`, a worse profile than the
independent-`beats` row above it. Of the sixteen spreads available, four tile
and one is unison. Both profiles are pinned in `src/dsp.test.ts`.

And the fan is **not layering**. Onsets move rather than accumulate: the four
channels are one rhythm entered at four places, not four densities of it.

#### `.rests` is the complement of channel a

Only channel a, and that is not an omission. The complement commutes with
rotation, so the complement of any other channel is one patched node away —
same `steps`, `beats`, `clock` and `reset`, at the rotation you want:

```ts
const rhythm = Euclid(ac, { clock, steps: 16, beats: 5, spread: 4, reset });
// the rests of channel c (rotation 8), which this node does not emit:
const cRests = Euclid(ac, {
  clock,
  steps: 16,
  beats: 5,
  rotation: 8,
  reset,
}).rests;
```

The **base** complement is the one that is reachable from no second node at all
— that is the argument above, and it is why that one is an output and these
three are not.

## Parameters

| Param         | Default | Range   | Rate   | Meaning                                                  |
| ------------- | ------- | ------- | ------ | -------------------------------------------------------- |
| `clock`       | 0       | 0 … 1   | a-rate | A phase ramp. Its wrap is the step boundary              |
| `steps`       | 8       | 0 … 100 | k-rate | Length of the cycle                                      |
| `beats`       | 3       | 0 … 100 | k-rate | How many of those steps are hits                         |
| `subdivision` | 1       | 1 … 20  | k-rate | Pattern cycles per clock cycle — a multiplier on `clock` |
| `swing`       | 1       | 1 … 3   | k-rate | Long-short ratio of each pair of steps; 1 is straight²   |
| `rotation`    | 0       | 0 … 100 | k-rate | How far the pattern is rotated                           |
| `spread`      | 0       | 0 … 100 | k-rate | How far apart the fan's channels are, in steps           |
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

**`spread` is the exception, and rebuilds nothing.** It is a rotation increment
in `rotation`'s own units — channel _i_ plays `rotation + i × spread` — and the
fan is an offset applied when the pattern is read, not a second pattern. So it
is the one count that never reaches the cache, and turning it is free.

**`rotation` clamps on the node and wraps in the function, and both are
deliberate.** `rotation` declares `minValue: 0`, so an `AudioParam` clamps a
negative value to 0 before the processor ever sees it:
`Euclid(ac, { rotation: -2 })` plays `rotation: 0`. `Euclid.pattern(8, 3, -2)`
has no declared range and wraps, returning what `rotation: 6` returns. A
parameter with a range and a pure function without one are two different
promises, and anyone who tries `-2` on the node and gets `0` deserves to have
been told which they were holding. Rotations _above_ `steps` reduce modulo
`steps` on both.

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

² Under `swing` the two steps of a pair are not the same length, so the cap is
computed against the **short** one — the binding step — and there is still one
width for every output. `pulseWidth: 1` therefore retriggers at every swing
setting except the corner where the short step is itself under a render
quantum: above about 700 BPM at `subdivision ≥ 12`, where no width can leave a
quantum low. Measured over 2268 settings (`bpm` 30–1000 × `subdivision` 1–20 ×
`swing` 1–3 × `pulseWidth` 0.05–1), 96 leave the gate under a quantum and every
one is in that corner — **none at `swing: 1`**. It is the "inert wherever it
cannot help" limit the straight clamp already had.

## Swing

`swing` moves **one boundary inside each pair of steps**. A pair's two steps
start at `0` and `swing / (1 + swing)` of the pair instead of `0` and `0.5`, and
each step's phase is measured against its own — now unequal — length. So a swung
step's gate is not subtly wider than a straight one: `pulseWidth` still means
"this fraction of _this_ step".

It is not "delay the odd steps". That phrasing invites an implementation that
adds a delay to an event and gets the gate width wrong.

| `swing` | feel                          |
| ------- | ----------------------------- |
| `1`     | straight — the default        |
| `2`     | triplet feel, the 2:1 shuffle |
| `3`     | dotted-eighth feel, 3:1       |

A **ratio**, not a percentage. It is the unit the papers use (2:1, 3:1, the
2.2:1 plateau below), and a knob whose 0.5 means straight has caught out every
person who has ever read an MPC manual. The cost is a non-zero number in the
"off" position, which is unusual for this library; it is the smaller of the two
costs. `swing: 1` is not merely close to no swing, it is **bit-identical** to
it — the pair reduction is algebraically the step reduction at a swing point of
0.5, and every operation in it is exact in binary floating point. Measured, zero
differing samples over 46 million.

**Against the subdivision.** At `subdivision: 2` the pairs are eighth pairs, at
`4` sixteenth pairs. This is why the parameter is here and not on `@synthlet/clock`,
which has no subdivision: a warp applied to the beat phase has its breakpoint at
the beat, so it swings eighths correctly and gives a half-bar shuffle at
`subdivision: 4`. Measured, at `subdivision: 4` over one beat of 3840 samples,
this design gives step lengths of **1280, 640, 1280, 640** where a beat-phase
warp gives 720, 720, 960, 1440 — not even monotonic. (Measured through the
module's own Float32 `clock` ramp the second pair reads 1281, 639: a boundary
that falls on 3200 of 3840 lands one sample late, because that phase rounds just
below 5/6 in single precision. Every pair is 2:1 to within that one sample.)

**Odd `subdivision`.** Pairs tile a clock cycle only when `subdivision` is even.
The leftover step is a **straight, full-length** step, so a clock cycle always
holds exactly `subdivision` boundaries — verified at every subdivision 1…20 and
every swing 1…3, with no cell dropping or gaining a step. At `subdivision: 5`
and `swing: 2` the cycle is 1.333, 0.667, 1.333, 0.667, 1.000 straight steps.
That is a decision rather than a fallback: letting the half-pair truncate would
give the leftover a phase spanning only `[0, 0.5/swingPoint)`, so any
`pulseWidth` above 0.67 would produce a gate that never falls in it.

**At `subdivision: 1` swing is inert**, bit-identically. `subdivision: 1` makes
every step the leftover, and that is right — swing subdivides the beat, and here
the step _is_ the beat.

**Parity.** Which half of a pair a sample falls in is a pure function of the
clock phase, so **two `Euclid`s on one `Clock` always swing the same way**,
`reset` or no `reset`. What `reset` anchors is where the _pattern_ sits on that
grid — and a reset landing past the swing point puts step 0 on the **short**
half, deterministically and identically in every node that shares the reset.
Reset on the beat and the downbeat is long. (Same class as the already
documented "a reset mid-step truncates the first step".) An odd `steps` beats
against the grid the same way: its step 0 alternates between the halves on
successive pattern cycles, with period 2 — defined, stable, and re-anchored by
`reset`.

### It is a convention, not a model of swing

This is the MPC/DAW knob, and it is worth saying what that knob is. Honing & de
Haas (2008) measured professional jazz drummers at beat durations across the
musical range and tested exactly the constant-ratio-at-any-tempo model every DAW
implements. They reject it: the swing ratio _"is not kept constant, but it is
systematically adapted to a global tempo"_, and swing performance _"cannot be
transposed in tempo by multiplying all durations with a constant factor"_. They
reject the linear alternative too — _"no evidence was found for a linear
interpretation"_ — and Friberg & Sundström's constant ~100 ms floor on the short
note, finding the second note's duration linear in beat duration instead,
r(3446) = .94, p < .0001, _"without support for a lower limit around 100 ms"_.
Their own data stabilise _"around a swing ratio close to 2.2:1"_ at slower tempi
and fall toward straight through the 250–350 ms beat-duration range, and they
decline to fit a curve: _"Clearly, a more complex model is needed."_

So this knob is a constant ratio at any tempo because that is the control users
expect and can turn — **not** because a drummer plays that way. Shipping the
convention and saying it is a convention is a stronger position than either
omitting swing or claiming it is authentic; shipping a tempo curve the corpus
does not supply would be worse than both.

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

What it does **not** decide is where the rhythm starts: the pattern is
Bjorklund's up to rotation, `rotation` is how you choose a starting point, and it
is step-indexed. Which rotation any named rhythm is, and why no rule can tell
you, is [Named rhythms](#named-rhythms).

One arithmetic bug in `rotate()` is worth recording because a `spread` fan walks
straight through it: a `rotation` at an exact non-zero multiple of `steps` used
to return the pattern concatenated with itself — the same rhythm, at twice the
length — at 482 of the 10100 `(steps, rotation)` pairs in the declared range.
Inaudible through the worklet, and not inaudible at all through
`Euclid.pattern`, which is an array people read rotations off. Fixed in the same
release, by reducing modulo the length before the zero short-circuit rather than
after it.

**What the loop costs.** Rendering a block of 128 samples on all five outputs is
**1.64 µs against a 2667 µs budget**, and five output buffers cost **+0.68 µs**
over one — 0.026 % of one core for the rests and the whole fan. `swing` is free:
1.636, 1.629 and 1.635 µs at the three settings, a span smaller than the
run-to-run noise. Every figure here is printed by
[`benchmarks/euclid-rate/`](https://github.com/danigb/synthlet/tree/main/benchmarks/euclid-rate),
which also refuses to publish a number measured on a loaded machine.

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
- H. Honing and W. B. de Haas,
  [_Swing Once More: Relating Timing and Tempo in Expert Jazz Drumming_](https://doi.org/10.1525/mp.2008.25.5.471),
  Music Perception 25(5), 2008 — why `swing` is a convention rather than a
  model: they test the constant-ratio-at-any-tempo model every DAW implements
  and reject it

## License

MIT © [danigb](https://github.com/danigb)
