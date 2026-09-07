# @synthlet/virtual-analog-filter

> Nine classic analog filter circuits, modelled and switchable

Part of [Synthlet](https://github.com/danigb/synthlet).

Where `@synthlet/state-variable-filter` gives you clean textbook responses, this
gives you _circuits_: the Moog ladder, the Korg 35, the diode ladder and the
Oberheim SEM, each with the nonlinearity and the resonance behaviour that make
it recognisable. Nine models behind one `type` parameter.

## Install

```bash
npm i @synthlet/virtual-analog-filter
```

Or `npm i synthlet` for every module at once.

## Usage

```ts
import {
  registerVirtualAnalogFilterWorklet,
  VirtualAnalogFilter,
} from "@synthlet/virtual-analog-filter";

const ac = new AudioContext();
await registerVirtualAnalogFilterWorklet(ac);

const filter = VirtualAnalogFilter(ac, {
  type: VirtualAnalogFilter.MOOG_LADDER,
  frequency: 900,
  resonance: 0.9,
});

osc.connect(filter).connect(ac.destination);

// a-rate: a smooth sweep, and a 200 Hz modulator is filter FM
lfo.connect(filter.frequency);
```

## Parameters

| Param       | Default | Range      | Rate   | Meaning                         |
| ----------- | ------- | ---------- | ------ | ------------------------------- |
| `type`      | 0       | 0 … 8      | k-rate | Which circuit — see below       |
| `frequency` | 1000    | 20 … 20000 | a-rate | Cutoff in Hz                    |
| `detune`    | 0       | −127 … 127 | a-rate | Semitones on top of `frequency` |
| `resonance` | 0.8     | 0 … 1      | a-rate | Resonance                       |

The nine models are on the factory as constants:
`VirtualAnalogFilter.MOOG_LADDER` (0), `MOOG_HALF_LADDER` (1), `KORG35_LPF` (2),
`KORG35_HPF` (3), `DIODE_LADDER` (4), `OBERHEIM_LPF` (5), `OBERHEIM_HPF` (6),
`OBERHEIM_BPF` (7) and `OBERHEIM_BSF` (8).

`frequency`, `detune` and `resonance` are `a-rate`, so an envelope or an LFO on
the cutoff is a smooth sweep. At one value per render quantum the cutoff was
sampled at 344.5 Hz, so anything above 172 Hz folded — a 200 Hz modulator
arrived as 144 Hz.

**An unmodulated patch does not pay for it.** Each model computes its
coefficients — a `Math.tan`, and a `Math.pow` too in the Korg 35 — at the top of
the block, and the filter renders in _runs of constant coefficients_: one run
when nothing is moving, which is exactly what it did before, and 128 when a
genuine per-sample sweep needs them. Each channel keeps its own state, so a
stereo sweep updates both.

`type` stays `k-rate`: it is an index into a bank of nine circuits, and
switching it mid-block is a discontinuity rather than a feature.

Every channel of the input is filtered, so a stereo signal stays stereo.

## Credits

Generated from the Faust virtual analog filter library
([`vaeffects.lib`](https://github.com/grame-cncm/faustlibraries/blob/master/vaeffects.lib)):
`ve.moogLadder` by Dario Sanfilippo, and `ve.moogHalfLadder`, `ve.korg35LPF`,
`ve.korg35HPF`, `ve.diodeLadder` and `ve.oberheim` by Eric Tarr. All are
declared under the STK-4.3 licence.

Full notice in [LICENSE.md](LICENSE.md) and in the repository's
[THIRD-PARTY-LICENSES.md](https://github.com/danigb/synthlet/blob/main/THIRD-PARTY-LICENSES.md).

## License

MIT © [danigb](https://github.com/danigb)
