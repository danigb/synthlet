# @synthlet/clock

> A tempo clock with two outputs: a phase ramp and a gate

Part of [Synthlet](https://github.com/danigb/synthlet).

The thing a sequenced patch is built on. It emits **two different signals**,
because the two things that consume a clock want different shapes:

- **the phase ramp**, on the node's own output — a 0…1 sawtooth restarting each
  beat. Subdividing a clock means multiplying its phase, so this is what
  `Euclid` reads.
- **the gate**, on `.gate` — high for `pulseWidth` of each beat. This is what an
  envelope or a drum voice reads.

They are not interchangeable. Feeding the ramp to an envelope's trigger used to
work by accident and does not any more.

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
_emits_ is written per sample either way.

`pulseWidth` is a fraction of the beat rather than a fixed duration, so at
120 BPM the default is 250 ms — about 86 render quanta, wide enough that no
consumer can miss it.

One phase accumulator per node: two `Clock` nodes drift unless they were built
in the same render quantum, which is why the gate is a second output rather
than a separate `ClockGate` module.

## License

MIT © [danigb](https://github.com/danigb)
