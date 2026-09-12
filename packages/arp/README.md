# @synthlet/arp

> An arpeggiator over a pitch-class scale, as an audio worklet

Part of [Synthlet](https://github.com/danigb/synthlet).

One trigger in, **one frequency out, in an order you choose**. On every rising
edge of `trigger` it takes the next note of a scale built on `baseNote`, spread
over `octaves`, in the order `mode` asks for, and holds it until the next
trigger.

## MIDI in, hertz out

**`baseNote` is a MIDI note number. The output is a frequency in hertz.** The
asymmetry is deliberate and it is the whole point of the module: the output is a
signal, so it goes straight into an oscillator's `frequency` and needs nothing
to interpret it.

```ts
arp.connect(osc.frequency); // Hz, not a MIDI note
```

Every arpeggiator you have used emits note events for something else to turn
into pitch. This one does not, and there is no note-event tier underneath it —
which is what lets a patch play itself with nothing scheduling it, and what lets
`baseNote`, `scale`, `mode` and the rest be `AudioParam`s that anything in the
library can drive.

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
arp.connect(osc.frequency);
osc.connect(ac.destination);
```

**A chord is a short scale.** `scale` is a 12-bit pitch-class mask either way,
and `ArpScale` has carried `TriadMajor`, `TriadMinor`, `Sus4`, `Dominant7th`,
`Major7th` and the rest since 0.1.0 — so `scale: ArpScale.TriadMinor` with
`mode: ArpMode.Up` is a minor arpeggio, and the same parameter set to `Dorian`
is a scale run.

And because it is a `Param`, **a chord progression is automation**:
`setValueAtTime` a sequence of masks and the melody follows the changes. No
hardware arpeggiator can do that, because in every one of them the chord is in
your fingers.

## Parameters

| Param        | Default | Range    | Rate   | Meaning                                      |
| ------------ | ------- | -------- | ------ | -------------------------------------------- |
| `trigger`    | 0       | 0 … 1    | a-rate | Rising edge takes the next note              |
| `mode`       | 0       | 0 … 5    | k-rate | The traversal — see `ArpMode`                |
| `octaveMode` | 0       | 0 … 1    | k-rate | How the octave travels — see `ArpOctaveMode` |
| `baseNote`   | 60      | 0 … 127  | k-rate | MIDI note number the scale is built on       |
| `scale`      | 137     | 1 … 4095 | k-rate | 12-bit pitch-class mask — see `ArpScale`     |
| `octaves`    | 1       | 1 … 10   | k-rate | How many octaves the sequence spans          |

`trigger` is `a-rate`, so the note changes on the trigger's own sample rather
than at the top of the next render quantum, and two triggers inside one block
advance the arpeggiator twice. Everything else is read when a step fires: a set
that changed between two samples of one note is not a set anybody chose.

`baseNote` is **continuous**, not an integer: `baseNote: 60.5` is a quarter tone
and the whole set moves with it. It also transposes a pattern that is already
running, without restarting it — the engine stores a position and works out the
note when it reads one. Before the first trigger arrives the output already
holds the note it is about to play, so patching it into a running oscillator
gives the right pitch immediately.

`octaves` is a count and is floored — `octaves: 2.5` spans exactly two — and the
note is **folded back down** under MIDI 127 rather than clamped there:
`baseNote: 127` with `octaves: 10` would otherwise reach MIDI 246, which is
12.1 MHz. Folding by twelve keeps the pitch class, so a folded note is still a
member of the set; a clamped one would not be.

`scale` is a bitmask, not an index: bit `i` set means pitch class `i` (semitones
above the root) belongs to the set, so the major scale `[0,2,4,5,7,9,11]` is
`0b101010110101` = `2741`. Any number in 1…4095 is a valid, if unusual, scale.
`ArpScale` names 28 of them — `Major`, `Minor`, `Dorian`, `PentatonicMinor`,
`Blues`, `WholeTone`, `TriadMajor`, `Sus4` and so on.

## Modes

Over a four-note set, where the numbers are positions in it:

| `ArpMode`         | plays                                          |
| ----------------- | ---------------------------------------------- |
| `Up`              | 1 2 3 4 · 1 2 3 4                              |
| `Down`            | 4 3 2 1 · 4 3 2 1                              |
| `UpDownExclusive` | 1 2 3 4 3 2 1 · 2 3 4 3 2 1                    |
| `UpDownInclusive` | 1 2 3 4 4 3 2 1 · 1 2 3 4 4 3 2 1              |
| `Random`          | any note but the one just played               |
| `RandomOther`     | every note once per pass, reshuffled each pass |

Both `UpDown` variants are spelled out because the names alone cannot tell you
which you got, and Arturia, u-he and PolyBrute all ship the two: the difference
is whether the turnaround notes play once or twice. The sequences above are the
KeyStep Pro manual's, and the tests assert them verbatim.

**`Random` wanders and `RandomOther` covers.** `Random` draws uniformly and
never repeats the note it just played, so it can dwell on a region of the set —
reach for it when you want the pattern to sound unpredictable. `RandomOther` is
a shuffle bag: every note of the set plays exactly once per pass, in a fresh
order each pass, so a pass is always a complete statement of the chord. Neither
ever plays the same note twice in a row.

The octave is **inside** the traversal, not outside it: over two octaves the
`UpDown` modes turn at the ends of the whole range, not at each octave.

`mode` is an `AudioParam` like everything else, so a slow `Lfo` patched into it
gives an arpeggiator whose direction is itself sequenced.

## Octaves

`octaveMode` says what a position in the sequence _means_. A minor triad over
three octaves, `mode: Up`:

| `ArpOctaveMode` | plays                          |
| --------------- | ------------------------------ |
| `Serial`        | 60 63 67 · 72 75 79 · 84 87 91 |
| `Repeat`        | 60 72 84 · 63 75 87 · 67 79 91 |

Same chord, same direction, same `octaves: 3`, a completely different figure:
three stacked arpeggios, or a rising sequence of octave leaps on each chord
tone. It is inert at `octaves: 1`, where the two agree.

Six modes × two octave modes is twelve traversals from two small enums.

## What it does not do

**It has no rate**, and that is the design rather than a gap. An arpeggiator is
three independent choices — which notes, what order, when — and only the first
two live here. The third is `Clock` and `Euclid`:

- **Rate, gate length, swing, downbeats** — `Clock`. Patch `clock.gate` into
  `trigger`.
- **Rhythm patterns, rests, per-step density** — `Euclid`, clocked by `Clock`.
- **A ratchet** — a faster `Clock` gated by the step. That is a patch, not a
  parameter.

**It does not take notes you hold.** `Arp` walks a pitch-class set you declare,
so as-played order, latch and velocity are not available here and cannot be:
a worklet cannot receive `noteOn`. Those belong to the arpeggiator _mode_ of the
polyphonic voice module, where the note stack, the velocity and the polyphony
already exist. Same vocabulary, two tiers — the relationship `Clock` already has
with a host transport.

**It has no user-defined step order.** That is where an arpeggiator becomes a
step sequencer, and this library has no sequencer module yet.

## Credits

The traversal is informed by reading Mutable Instruments' Yarns and Plaits and
rune06's Juno arpeggiator, all in `refs/`, but it is not a port of any of them:
they walk nested note and octave counters and this walks one flat index, which
is what makes `octaveMode` a mapping rather than a rewrite. The two `UpDown`
index sequences reproduce Arturia's published specification for the KeyStep Pro.

## License

MIT © [danigb](https://github.com/danigb)
