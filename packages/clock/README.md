# @synthlet/clock

> A tempo clock: a phase and a gate, at the beat and at the bar

Part of [Synthlet](https://github.com/danigb/synthlet).

The thing a sequenced patch is built on. It emits **two kinds of signal**,
because the two things that consume a clock want different shapes:

- **a phase** is a rising `[0, 1)` ramp, written one value per sample.
  Subdividing a clock means _multiplying_ its phase, so this is what `Euclid`
  reads.
- **a gate** is high for `pulseWidth` of each cycle. This is what an envelope or
  a drum voice reads.

They are not interchangeable, and no threshold turns one into the other: any
threshold on a ramp fires early, and `> 0` latches on forever. Feeding a phase
to an envelope's trigger used to work by accident and does not any more.

It emits each of them **at two levels** — the beat and the bar — because "the
first beat of the bar" is a thing patches need and nothing downstream can work
out for itself. All four come from one accumulator, read at the same sample, so
they cannot describe different instants: the gate rises on exactly the sample
the phase wraps, and a `Euclid` on the same clock fires on exactly that sample
too.

## Install

```bash
npm i @synthlet/clock
```

Or `npm i synthlet` for every module at once.

## Usage

```ts
import { registerClockWorklet, Clock } from "@synthlet/clock";

const ac = new AudioContext();
await registerClockWorklet(ac);

const clock = Clock(ac, { bpm: 120, beatsPerBar: 4 });

KickDrum(ac, { trigger: clock.gate }); // every beat
CowBellDrum(ac, { trigger: clock.downbeat }); // once a bar
Euclid(ac, { clock, subdivision: 4, steps: 16, beats: 5 }); // sixteenths
Euclid(ac, { clock: clock.bar, subdivision: 8, steps: 8, beats: 3 }); // per bar

clock.dispose(); // disposes the three gain nodes with it
```

## Outputs

| Output          | What it is                                         | What reads it                      |
| --------------- | -------------------------------------------------- | ---------------------------------- |
| the node itself | beat phase — `[0, 1)`, restarting each beat        | `Euclid`, anything that subdivides |
| `.gate`         | beat gate — high for `pulseWidth` of a beat        | envelopes, drum voices             |
| `.bar`          | bar phase — the same ramp over `beatsPerBar` beats | anything that subdivides a bar     |
| `.downbeat`     | the beat gate, on the first beat of each bar only  | an accent, a pattern reset         |

`.downbeat` is a **subset of `.gate`**: both take their width from the same
`pulseWidth` and the same phase at the same sample, so they rise and fall
together and `downbeat > 0` implies `gate > 0` everywhere. The two can be summed
or compared with no phase relationship to reason about.

One accumulator per node, four views of it — which is why these are outputs
rather than four sibling modules. A second `Clock` node is a second accumulator
(see [Timing](#timing)).

## Parameters

| Param         | Default | Range    | Rate   | Meaning                                            |
| ------------- | ------- | -------- | ------ | -------------------------------------------------- |
| `bpm`         | 120     | 0 … 1000 | k-rate | Tempo in beats per minute                          |
| `pulseWidth`  | 0.5     | 0 … 1    | k-rate | Fraction of each beat the gates are high for¹      |
| `beatsPerBar` | 4       | 0 … 32   | k-rate | Beats per bar; `0` silences `.bar` and `.downbeat` |
| `reset`       | 0       | 0 … 1    | a-rate | Rising edge returns the phase and the bar to 0     |

**Why those rates.** `bpm` is `k-rate` because the phase increment is derived
from it and cached, and a tempo that changed every sample is frequency
modulation of the clock rather than a tempo — `Lfo` and `Param` are the modules
for that. `pulseWidth` and `beatsPerBar` describe the _shape_ of a cycle, which
the phase is what places, and a bar boundary only ever needs locating to within
a render quantum. `reset` is `a-rate` because it is an _event_: it lands on its
own sample rather than at the top of the next quantum, and two resets inside one
block are two resets. What the clock _emits_ is written per sample regardless of
any of this.

`pulseWidth` is a fraction of the beat rather than a fixed duration, so at
120 BPM the default is 250 ms — 11025 samples at 44.1 kHz, wide enough that no
consumer can miss it. A fixed short pulse could land inside one render quantum
and be invisible to a consumer that reads its trigger once per block.

¹ **`pulseWidth: 1` means "the widest gate that still retriggers"**, not 100 %.
A gate is a trigger when it goes from non-positive to positive, so a gate that
never falls can never fire anything again — and against a `[0, 1)` phase, a
literal 100 % is exactly that: one envelope attack, then silence. The width is
capped to leave one render quantum of every beat low, which is what a consumer
reading its trigger once per block needs in order to see the falling edge. The
cap is tempo-aware — 0.9941 at 120 BPM, 0.9512 at 1000 BPM — and inert below
0.95 at every tempo in range, so nothing you would ordinarily set is affected.

There is no time-signature denominator: `bpm` defines what a beat is. 6/8 at
dotted-quarter = 60 is `bpm: 60, beatsPerBar: 2`, or `bpm: 180, beatsPerBar: 6`,
depending on what you want to count.

Changing `beatsPerBar` while the clock runs re-phases the grid from the next
beat. The counter is beats-since-start and the bar position is
`beats % beatsPerBar`, so nothing emits a spurious downbeat or swallows one.

## Timing

Everything below was measured against this engine over **600 s at 44100 and
48000 Hz**, for tempi of **60, 120, 137.3 and 400 BPM** — rates and tempi chosen
so that a beat is never a whole number of 128-sample blocks, because that is the
case where a clock's errors hide.

| Quantity                                 |                           Measured | Held by                                                                       |
| ---------------------------------------- | ---------------------------------: | ----------------------------------------------------------------------------- |
| Deviation from ideal beat time           | **≤ 1 sample** (23 µs at 44.1 kHz) | `dsp.test.ts` — "keeps every beat within one sample of its ideal time"        |
| Cumulative drift over 600 s              |                              **0** | `dsp.test.ts` — "does not accumulate drift"                                   |
| `.gate` vs. a `Euclid` on the same clock |                      **0 samples** | `euclid`'s `clock-skew.test.ts` — "lands every Euclid hit on the same sample" |
| Gate low time at any `pulseWidth`        |             **≥ 1 render quantum** | `dsp.test.ts` — "never latches the gate, anywhere in the declared range"      |

**These are this repository's own figures and are comparable only within it.**
They are not any published metric, so reading them against numbers from
elsewhere is not meaningful; what they are good for is keeping this module from
regressing, which is the job they were written for. Every one of them is
asserted, not just recorded — a clock that gets worse fails the build.

The accumulator is float64 and exact, so the **tempo** does not drift; what is
quantised is the _rendering_, and it is quantised to a sample. Beating one
sample would need a fractional sub-sample output and a consumer that could read
one, and nothing in this library can.

**Two `Clock` nodes are two accumulators.** They keep identical tempo and hold a
**constant offset** from each other — measured at 44100 Hz and 120 BPM, a clock
born 37 blocks late stays 4736 samples behind, identically on the first beat and
on the last, across 600 s. That is a fixed phase offset, not drift, and the
difference matters: an offset is repairable, and drift would not be. What
repairs it is the next section.

## Sync

`reset` is how two things agree on where the beat is. On its rising edge the
phase returns to 0 **on that exact sample**, and the next beat starts there:

```ts
const a = Clock(ac, { bpm: 120 });
const b = Clock(ac, { bpm: 120, reset: a.downbeat }); // b follows a's bars
```

**Two patterns starting together** is the same mechanism one level down. Each
`Euclid` keeps a private step counter that starts when _that node_ was built, so
two of them on one clock play different rotations of the same pattern unless you
say otherwise — measured across 32 birth offsets, 28 diverge. Patch both `reset`
inlets from the same signal and they agree:

```ts
const clock = Clock(ac, { bpm: 120, beatsPerBar: 4 });
const a = Euclid(ac, { clock, steps: 8, beats: 3, reset: clock.downbeat });
const b = Euclid(ac, { clock, steps: 16, beats: 5, reset: clock.downbeat });
// both start their step 0 on the same downbeat, however they were built
```

A clock starts on a downbeat, and a reset returns it to one — it puts you at the
top of a bar rather than the top of an arbitrary beat. It is **edge triggered**:
holding the inlet high resets once, not once per sample. A reset on a stopped
clock (`bpm: 0`) re-aligns where the clock will start from without emitting a
gate.

There is no separate `run` inlet: `bpm: 0` is how this library stops a clock,
and a second answer to that question would be one answer too many. To stop
without losing the tempo value, hold it in a `Param`.

**This is a mechanism, not a policy.** Nothing here decides what two clocks
should agree on, and two of them free-run independently unless you wire them
together — there is no transport, no master clock and no implicit global
timeline. The mechanism is the part you cannot build downstream; the policy is
the part you can.

## License

MIT © [danigb](https://github.com/danigb)
