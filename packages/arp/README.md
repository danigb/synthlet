# @synthlet/arp

> An arpeggiator over a pitch-class scale, as an audio worklet

Part of [Synthlet](https://github.com/danigb/synthlet).

One trigger in, **a frequency in Hz out**. On every rising edge of `trigger` it
takes the next note of a scale built on `baseNote`, spread over `octaves`, in
the order `mode` asks for, and holds that frequency on its output until the next
trigger — so its output goes straight into an oscillator's `frequency`.

It has an order and no rate of its own. What drives it is whatever you patch
into `trigger` — a `Clock`'s gate, a `Euclid`, an `Impulse`. Rate, gate length,
swing and rhythm belong to those modules, deliberately: an arpeggiator is three
independent choices — which notes, what order, when — and only the first two are
here.

## Install

```bash
npm i @synthlet/arp
```

Or `npm i synthlet` for every module at once.

## Usage

```ts
import { registerArpWorklet, Arp, ArpMode, ArpScale } from "@synthlet/arp";

const ac = new AudioContext();
await registerArpWorklet(ac);

const arp = Arp(ac, {
  trigger: clock.gate,
  baseNote: 48, // C3
  scale: ArpScale.TriadMinor, // a chord is a short scale
  octaves: 2,
  mode: ArpMode.UpDownExclusive,
});

const osc = new OscillatorNode(ac);
osc.start();
arp.connect(osc.frequency); // Hz, not a MIDI note
osc.connect(ac.destination);
```

## Parameters

| Param      | Default | Range    | Rate   | Meaning                                  |
| ---------- | ------- | -------- | ------ | ---------------------------------------- |
| `trigger`  | 0       | 0 … 1    | a-rate | Rising edge takes the next note          |
| `mode`     | 0       | 0 … 4    | k-rate | The traversal — see `ArpMode`            |
| `baseNote` | 60      | 0 … 127  | k-rate | MIDI note number the scale is built on   |
| `scale`    | 137     | 1 … 4095 | k-rate | 12-bit pitch-class mask — see `ArpScale` |
| `octaves`  | 1       | 1 … 10   | k-rate | How many octaves the sequence spans      |

## Modes

Over a four-note set, where the numbers are positions in it:

| `ArpMode`         | plays                             |
| ----------------- | --------------------------------- |
| `Up`              | 1 2 3 4 · 1 2 3 4                 |
| `Down`            | 4 3 2 1 · 4 3 2 1                 |
| `UpDownExclusive` | 1 2 3 4 3 2 1 · 2 3 4 3 2 1       |
| `UpDownInclusive` | 1 2 3 4 4 3 2 1 · 1 2 3 4 4 3 2 1 |
| `Random`          | any note of the set, uniformly    |

Both `UpDown` variants are spelled out because the names alone cannot tell you
which you got, and Arturia, u-he and PolyBrute all ship the two: the difference
is whether the turnaround notes play once or twice. The sequences above are the
KeyStep Pro manual's, and the tests assert them verbatim.

The octave is **inside** the traversal, not outside it: over two octaves the
`UpDown` modes turn at the ends of the whole range, not at each octave.

`mode` is an `AudioParam` like everything else, so a slow `Lfo` patched into it
gives an arpeggiator whose direction is itself sequenced.

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
