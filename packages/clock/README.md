# @synthlet/clock

> A tempo clock with two outputs: a phase ramp and a gate

Part of [Synthlet](https://github.com/danigb/synthlet).

The thing a sequenced patch is built on. It emits **two different signals**,
because the two things that consume a clock want different shapes:

- **the phase ramp**, on the node's own output — a `[0, 1)` sawtooth restarting
  each beat, written **one value per sample**. Subdividing a clock means
  multiplying its phase, so this is what `Euclid` reads.
- **the gate**, on `.gate` — high for `pulseWidth` of each beat. This is what an
  envelope or a drum voice reads.

They are not interchangeable. Feeding the ramp to an envelope's trigger used to
work by accident and does not any more.

Both are rendered from one accumulator and read at the same sample, so they
cannot describe different instants: the gate rises on exactly the sample the
phase wraps, and a `Euclid` on the same clock fires on exactly that sample too.

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

const clock = Clock(ac, { bpm: 120, pulseWidth: 0.25 });

Euclid(ac, { clock }); // the ramp
KickDrum(ac, { trigger: clock.gate }); // the gate

clock.dispose(); // disposes the gate node with it
```

## Parameters

| Param        | Default | Range    | Rate   | Meaning                                    |
| ------------ | ------- | -------- | ------ | ------------------------------------------ |
| `bpm`        | 120     | 0 … 1000 | k-rate | Tempo in beats per minute                  |
| `pulseWidth` | 0.5     | 0 … 1    | k-rate | Fraction of each beat the gate is high for |

Both are `k-rate`: the phase increment is derived from `bpm` and cached, and a
tempo that changed every sample is frequency modulation of the clock rather
than a tempo — `Lfo` and `Param` are the modules for that. What the clock
_emits_ is written per sample either way, which is a different question from
how often its parameters are read.

`pulseWidth` is a fraction of the beat rather than a fixed duration, so at
120 BPM the default is 250 ms — 11025 samples at 44.1 kHz, wide enough that no
consumer can miss it. A fixed short pulse could land inside one render quantum
and be invisible to a consumer that reads its trigger once per block.

One phase accumulator per node, and both nodes derive the same increment — so
two `Clock` nodes built in different render quanta do not drift apart, they hold
a **constant offset**. Measured at 44100 Hz and 120 BPM: a clock born 37 blocks
late stays 4736 samples behind, identically on the first beat and on the last,
across 600 s. A fixed phase offset is a repairable thing and drift would not be;
what repairs it is an alignment inlet, which this module does not have yet.

That is also why the gate is a second output rather than a separate `ClockGate`
module: one accumulator, two views of it.

## Timing

Measured against this engine over 600 s at 44100 and 48000 Hz, for tempi of 60,
120, 137.3 and 400 BPM — rates and tempi chosen so that a beat is never a whole
number of 128-sample blocks:

| Quantity                        |              Measured |
| ------------------------------- | --------------------: |
| Deviation from ideal beat time  | **≤ 1 sample**, 23 µs |
| Cumulative drift over 600 s     |                 **0** |
| `Clock.gate` vs. `Euclid` on it |         **0 samples** |

The accumulator is float64 and exact, so the tempo does not drift; what is
quantised is the _rendering_, and it is quantised to a sample. Beating that
needs a fractional sub-sample output and a consumer that could read one, and
nothing in this library can.

One caveat, because it is easy to assume otherwise: two `Clock` nodes are two
accumulators. They keep perfect tempo and a constant offset from each other —
as described above — which is not the same as being in phase.

## License

MIT © [danigb](https://github.com/danigb)
