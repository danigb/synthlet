# @synthlet/lfo

> A low-frequency oscillator with eleven shapes, as an audio worklet

Part of [Synthlet](https://github.com/danigb/synthlet).

The modulation source. Web Audio's `OscillatorNode` gives you four waveforms
and none of the ones modulation actually wants — no sample-and-hold, no
exponential ramps, no single-sample impulse — and no gain or offset without two
more nodes. This is one node with all of it.

It emits **a signal, one value per sample**, so a slow sine on a pitch or a
gain is smooth rather than a 344 Hz staircase.

## Install

```bash
npm i @synthlet/lfo
```

Or `npm i synthlet` for every module at once.

## Usage

```ts
import { registerLfoWorklet, Lfo, LfoType } from "@synthlet/lfo";

const ac = new AudioContext();
await registerLfoWorklet(ac);

const osc = new OscillatorNode(ac, { frequency: 440 });
osc.start();

// ±10 Hz of vibrato at 5 Hz
const vibrato = Lfo(ac, { type: LfoType.Sine, frequency: 5, gain: 10 });
vibrato.connect(osc.frequency);

osc.connect(ac.destination);
```

## Parameters

`output = gen(phase) × gain + offset`

| Param       | Default | Range     | Rate   | Meaning                       |
| ----------- | ------- | --------- | ------ | ----------------------------- |
| `type`      | 1       | 0 … 10    | k-rate | Waveform — see `LfoType`      |
| `frequency` | 10      | 0 … 200   | k-rate | Rate in Hz                    |
| `gain`      | 1       | 0 … 10000 | k-rate | Amplitude                     |
| `offset`    | 0       | ±1000     | k-rate | Where the waveform is centred |

## Shapes

`type` is an index into `LfoType`. **Every continuous shape crosses zero going
up at phase 0** — a modulation source's zero point is no modulation — so an LFO
whose phase is reset starts with no effect on what it is patched into. `Square`
and `Impulse` are the exceptions and cannot be otherwise: a square has no zero
crossing, and the impulse's single sample _is_ the cycle boundary.

| `LfoType`            | φ=0  | φ=¼     | φ=½  | φ=¾     | Jumps at |
| -------------------- | ---- | ------- | ---- | ------- | -------- |
| `None` (0)           | 0    | 0       | 0    | 0       | —        |
| `Sine` (1)           | 0    | +1      | 0    | −1      | —        |
| `Triangle` (2)       | 0    | +1      | 0    | −1      | —        |
| `RampUp` (3)         | 0    | +0.5    | −1   | −0.5    | φ=½      |
| `RampDown` (4)       | 0    | −0.5    | +1   | +0.5    | φ=½      |
| `Square` (5)         | +1   | +1      | −1   | −1      | φ=0, φ=½ |
| `ExpRampUp` (6)      | 0    | +0.1246 | −1   | −0.1246 | φ=½      |
| `ExpRampDown` (7)    | 0    | −0.1246 | +1   | +0.1246 | φ=½      |
| `ExpTriangle` (8)    | 0    | +1      | 0    | −1      | —        |
| `RandSampleHold` (9) | held | held    | held | held    | φ=0      |
| `Impulse` (10)       | 1    | 0       | 0    | 0       | φ=0      |

Every shape swings the full ±1 and averages to zero over a cycle, so `gain` is
the whole depth and nothing here adds DC to what it modulates.

The three `Exp*` shapes are their linear partners bent inward: same zeros, same
peaks, same sign everywhere, and only the path between them differs. The bend is
the MMA concave transform (see Credits).

All four parameters are `k-rate` — what is audio-rate here is the **output**,
which is a different question. `type` is structural: swapping generator 128
times a block is not waveform modulation, it is noise. The other three are read
once per block, which lets the generator hoist its phase increment out of the
sample loop; a modulated `frequency` still moves, one step per render quantum.
For an envelope on the depth, put a native `GainNode` between the LFO and its
destination — that is a-rate and free.

## Credits

`concaveTransform` is the MMA concave transform as presented by
[Will Pirkle](https://www.willpirkle.com/) (Tritone Systems) in _Designing
Software Synthesizer Plug-Ins in C++_ and SynthLab, including the 5.0/12.0
correction coefficient.

See the repository's
[THIRD-PARTY-LICENSES.md](https://github.com/danigb/synthlet/blob/main/THIRD-PARTY-LICENSES.md).

## License

MIT © [danigb](https://github.com/danigb)
