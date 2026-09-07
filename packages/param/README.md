# @synthlet/param

> A value with a unit: the module that makes numbers and nodes interchangeable

Part of [Synthlet](https://github.com/danigb/synthlet).

`Param` is a source node that carries one value — and because it is a node, it
can carry a _signal_ instead. That is the whole point: anywhere a Synthlet
module takes a parameter, a number and a node are the same kind of thing, and
`Param` is what makes that true.

On the way out it applies a conversion, a gain and an offset, so it is also
where units get fixed: decibels into a linear gain, a 0…1 knob into a real
range, a sign flip for an inverted modulation.

## Install

```bash
npm i @synthlet/param
```

Or `npm i synthlet` for every module at once.

## Usage

```ts
import { registerParamWorklet, Param, ParamScaleType } from "@synthlet/param";

const ac = new AudioContext();
await registerParamWorklet(ac);

// A number, modulated by a node
const cutoff = Param(ac, { input: 1200, mod: lfo, gain: 1 });
cutoff.connect(filter.frequency);

// Shortcuts for the common conversions
Param.db(ac, -6); //            decibels to a linear gain
Param.lin(ac, knob, 20, 20000); // a 0…1 input scaled to a range
Param.mul(ac, source, 0.5); //   scaling
Param.inv(ac, source); //        sign inversion
Param.input(ac, 440); //         a plain value
```

## Parameters

`output = offset + gain × convert(input + mod)`

| Param    | Default | Range  | Rate   | Meaning                                                |
| -------- | ------- | ------ | ------ | ------------------------------------------------------ |
| `input`  | 0       | ±20000 | a-rate | The signal                                             |
| `mod`    | 0       | ±20000 | a-rate | A second signal, summed with `input` before conversion |
| `scale`  | 0       | 0 … 3  | k-rate | Which converter — see `ParamScaleType`                 |
| `min`    | 0       | ±20000 | k-rate | Bottom of `Linear`'s range; ignored otherwise          |
| `max`    | 1       | ±20000 | k-rate | Top of the same range                                  |
| `gain`   | 1       | ±20000 | k-rate | Applied after the conversion                           |
| `offset` | 0       | ±20000 | k-rate | Added last                                             |

`ParamScaleType` is `Bypass` (0), `DbToGain` (1), `GainToDb` (2) or `Linear` (3).

The split is **signal against coefficient**. `input` and `mod` are what `Param`
carries and are read per sample, so a gate edge or an LFO passes through with
its timing intact. The other five describe what it _does_ to them, are set once
at construction by every factory above, and are read once per block. With
nothing connected — or with a constant connected — the whole block still takes
a `fill()` fast path, so an unautomated `Param` costs what it always did.

The `±20000` bounds are a safety limit, not a hint for a slider. Unlike a
module's own parameters, a `Param` carries whatever its destination needs — a
frequency in Hz, a level in dB, a time in seconds — and has no natural range of
its own. `scale` is the exception; it is bounded by the enum.

## License

MIT © [danigb](https://github.com/danigb)
