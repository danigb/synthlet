# @synthlet/ring-mod

> A ring modulator and an amplitude modulator, as one audio worklet

Part of [Synthlet](https://github.com/danigb/synthlet).

`carrier × (offset + modulator)`, with a DC blocker on each input. `offset: 0`
is ring modulation — the two inputs vanish and only their sum and difference
come out, which is the only cheap route to inharmonic, metallic and clangorous
timbres in a subtractive library. `offset: 1` is amplitude modulation. The ARP
2600 had a switch for that; here it is a knob, and everything between is
available.

## Install

```bash
npm i @synthlet/ring-mod
```

Or `npm i synthlet` for every module at once.

## Usage

```ts
import { registerRingModWorklet, RingMod } from "@synthlet/ring-mod";

const ac = new AudioContext();
await registerRingModWorklet(ac);

const modulator = new OscillatorNode(ac, { frequency: 200 });
modulator.start();

const ring = RingMod(ac, { modulator, offset: 0 });
carrier.connect(ring).connect(ac.destination);
```

A 300 Hz carrier against that 200 Hz modulator gives 100 Hz and 500 Hz, and
nothing at 200 or 300 — Synth Secrets Part 11, Figure 10.

## Why this is not four lines of Web Audio

The ideal multiply really is four lines, and if that is all you want, use them:

```ts
const vca = new GainNode(ac, { gain: 0 });
carrier.connect(vca);
modulator.connect(vca.gain); // gain.gain is a-rate and unclamped
```

What that chain does not give you is the three things this package is for.

1. **AC coupling.** A `GainNode` multiplies whatever it is given, DC and all,
   and DC on either side leaks the _other_ signal straight through to the
   output. That is the difference between a ring modulator and a VCA, and it is
   why Part 11 says an RM "only works in the fashion described when both the
   Carrier and the Modulator waveforms are precisely centred on zero volts".
2. **The AM↔RM continuum as one parameter.** `offset` is the DC the modulator
   is deliberately given back _after_ AC coupling, so one knob spans both
   modules.
3. **A seam for the diode model.** A real ring modulator sounds like itself
   because the multiply is _imperfect_. `RingModType` has one member today and
   room for `Diode` (Parker, DAFx-11) later.

## Parameters

| Param       | Default | Range    | Rate   | Meaning                                          |
| ----------- | ------- | -------- | ------ | ------------------------------------------------ |
| `type`      | 0       | 0 … 0    | k-rate | `RingModType.Ideal` (0)                          |
| `modulator` | 0       | −10 … 10 | a-rate | The modulating signal                            |
| `offset`    | 0       | −1 … 1   | k-rate | DC added back after coupling: 0 is RM, 1 is AM   |
| `coupling`  | 1       | 0 … 1    | k-rate | 1 blocks DC on both inputs, 0 is the "lesser RM" |

### The modulator is a parameter, and that costs two things

`connectParams` wires parameters and nothing else, and no package in this
library declares `numberOfInputs: 2`. So the second audio signal arrives as an
a-rate `AudioParam`, and two consequences come with that:

- **An `AudioParam` input is down-mixed to mono.** A stereo modulator is summed
  before it is seen. The carrier keeps its channels; the modulator does not.
- **An a-rate parameter is clamped to its declared range.** `modulator` spans
  ±10 rather than ±1 so a hot signal modulates rather than squaring off — but
  a signal above ±10 _will_ square off.

Every channel of the carrier is modulated by the same modulator, so a stereo
carrier stays stereo and its two channels stay in step.

### The output is not DC-blocked, on purpose

When the two frequencies coincide — Reid's Case 1, 100 Hz against 100 Hz — the
difference tone lands at 0 Hz, and "this manifests itself as an offset in the
signal". That offset is signal. The module AC-couples its **inputs**.

### The passband cost of AC coupling

The blockers are one-pole highpasses at 5 Hz, derived from the sample rate so
44.1 and 48 kHz block the same corner. Their gain is 0.958 at 20 Hz, 0.999 at
100 Hz and 1.0003 at 300 Hz, with a phase shift of about a degree at 300 Hz. So
`offset: 1` with nothing connected to `modulator` is a near-bypass rather than a
bit-exact one; set `coupling: 0` if you need the identity.

## License

MIT © [danigb](https://github.com/danigb)
