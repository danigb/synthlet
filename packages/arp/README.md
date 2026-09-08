# @synthlet/arp

> A random arpeggiator over a pitch-class scale, as an audio worklet

Part of [Synthlet](https://github.com/danigb/synthlet).

One trigger in, **a frequency in Hz out**. On every rising edge of `trigger` it
picks a note at random from a scale built on `baseNote`, spread over `octaves`,
and holds that frequency on its output until the next trigger — so its output
goes straight into an oscillator's `frequency`.

It is a random walk over a set of notes, not a pattern player: there is no
sequence, no direction and no rate of its own. What drives it is whatever you
patch into `trigger` — a `Clock`'s gate, a `Euclid`, an `Impulse`.

## Install

```bash
npm i @synthlet/arp
```

Or `npm i synthlet` for every module at once.

## Usage

```ts
import { registerArpWorklet, Arp, ArpScale } from "@synthlet/arp";

const ac = new AudioContext();
await registerArpWorklet(ac);

const arp = Arp(ac, {
  trigger: clock.gate,
  baseNote: 48, // C3
  scale: ArpScale.PentatonicMinor,
  octaves: 3,
});

const osc = new OscillatorNode(ac);
osc.start();
arp.connect(osc.frequency); // Hz, not a MIDI note
osc.connect(ac.destination);
```

## Parameters

| Param      | Default | Range    | Rate   | Meaning                                            |
| ---------- | ------- | -------- | ------ | -------------------------------------------------- |
| `trigger`  | 0       | 0 … 1    | a-rate | Rising edge picks the next note                    |
| `baseNote` | 60      | 0 … 127  | k-rate | MIDI note number the scale is built on             |
| `scale`    | 1       | 1 … 4095 | k-rate | 12-bit pitch-class mask — see `ArpScale`           |
| `octaves`  | 1       | 1 … 10   | k-rate | How many octaves above the root the pick may reach |

`trigger` is `a-rate`, so the note changes on the trigger's own sample rather
than at the top of the next render quantum, and two triggers inside one block
advance the arpeggiator twice.

`baseNote` is **continuous**, not an integer: `baseNote: 60.5` is a quarter
tone, and the whole set moves with it. Before the first trigger arrives the
output holds the root, so patching it into a running oscillator gives the right
pitch immediately.

`octaves` is a count and is floored — `octaves: 2.5` spans exactly two — and the
note is **folded back down** under MIDI 127 rather than clamped there:
`baseNote: 127` with `octaves: 10` would otherwise reach MIDI 246, which is
12.1 MHz. Folding by twelve keeps the pitch class, so a folded note is still a
member of the set; clamping would not be.

The other three describe the _set_ being picked from and are read when a step
fires. `scale` is a bitmask, not an index: bit `i` set means pitch class `i`
(semitones above the root) belongs to the scale, so the major scale
`[0,2,4,5,7,9,11]` is `0b101010110101` = `2741`. Any number in 1…4095 is a
valid, if unusual, scale. `ArpScale` names 28 of them — `Major`, `Minor`,
`Dorian`, `PentatonicMinor`, `Blues`, `WholeTone`, `TriadMajor`, `Sus4` and so
on.

## License

MIT © [danigb](https://github.com/danigb)
