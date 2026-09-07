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

`LfoType` is `None` (0), `Sine` (1), `Triangle` (2), `RampUp` (3), `RampDown`
(4), `Square` (5), `ExpRampUp` (6), `ExpRampDown` (7), `ExpTriangle` (8),
`RandSampleHold` (9) and `Impulse` (10).

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

MIT © [Daniel Gómez Blasco](https://github.com/danigb)
