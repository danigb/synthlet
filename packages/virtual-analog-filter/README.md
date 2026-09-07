# @synthlet/virtual-analog-filter

> Five analog filter circuits, nine responses, one `type` parameter

Part of [Synthlet](https://github.com/danigb/synthlet).

Where `@synthlet/state-variable-filter` gives you clean textbook responses, this
gives you _circuits_: the Moog ladder and its half-ladder sibling, the Korg 35,
the diode ladder and the Oberheim SEM. Nine `type` values, because the Oberheim
is one filter with four taps.

Two of them self-oscillate. Four of them saturate. Two are linear and say so.

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
  drive: 1,
});

osc.connect(filter).connect(ac.destination);

// a-rate: a smooth sweep, and a 200 Hz modulator is filter FM
lfo.connect(filter.frequency);
```

## Parameters

| Param       | Default | Range      | Rate   | Meaning                                     |
| ----------- | ------- | ---------- | ------ | ------------------------------------------- |
| `type`      | 0       | 0 … 8      | k-rate | Which response — see below                  |
| `frequency` | 1000    | 20 … 20000 | a-rate | Cutoff in Hz                                |
| `detune`    | 0       | −127 … 127 | a-rate | Semitones on top of `frequency`             |
| `resonance` | 0.8     | 0 … 1      | a-rate | Resonance; the ladders oscillate above 0.95 |
| `drive`     | 1       | 0 … 100    | a-rate | Input gain into the saturator               |

`frequency` is Hz, at every sample rate. The cutoff is bounded with Zavalishin's
continuous-speed prewarping (§3.8, eq. 3.23) rather than clamped, so sweeping
`frequency` and `detune` together past Nyquist slows the curve instead of
putting a kink in it.

**`resonance` does not change the level.** Every model applies makeup gain, so
opening the resonance opens the resonance. The Moog ladder used to lose 5.1 dB
at `resonance: 0.2` and 13.3 dB at 0.9, and the Oberheim bandpass used to
_gain_ 32 dB across the same range.

**Above `resonance: 0.95` the two ladders self-oscillate**, at a frequency that
tracks `frequency`. Below it they are silent without input. That is what the
saturating feedback path buys: a linear ladder has one loop gain for every
amplitude, so it can only decay, hold, or diverge.

**`drive` is only a drive where there is something to drive into.** On
`DIODE_LADDER` it is the saturator's input gain — `drive: 100` is the fuzzbox
this package used to be unconditionally, and 1 is clean. On the two ladders and
the four Oberheim taps it reaches a real nonlinearity. On `KORG35_LPF` and
`KORG35_HPF` it is input gain and nothing more, because those circuits are
linear.

## The nine responses

Five circuits. The Oberheim is one filter read at four taps, which is why it
accounts for four of the nine values.

| `type`                          | Circuit          | Response    | Order | Nonlinear                 |
| ------------------------------- | ---------------- | ----------- | ----- | ------------------------- |
| `MOOG_LADDER` (0)               | Moog ladder      | Low-pass    | 4     | **yes** — self-oscillates |
| `MOOG_HALF_LADDER` (1)          | Moog half ladder | Low-pass    | 2     | **yes** — self-oscillates |
| `KORG35_LPF` (2)                | Korg 35          | Low-pass    | 2     | no                        |
| `KORG35_HPF` (3)                | Korg 35          | High-pass   | 2     | no                        |
| `DIODE_LADDER` (4)              | Diode ladder     | Low-pass    | 4     | yes — soft clipper        |
| `OBERHEIM_LPF` … `_BSF` (5 … 8) | Oberheim SEM     | LP/HP/BP/BS | 2     | yes — soft clipper        |

The `-3 dB` corner sits where the topology puts it, not exactly on `frequency`:
a cascade of four one-pole sections crosses `-3 dB` below its design cutoff and
a 2-pole section at or above it. Asking for 1000 Hz at 48 kHz measures 907 Hz on
the Moog ladder, 1163 on the half ladder, 870 on the Korg 35, 502 on the diode
ladder and 1542 on the Oberheim. That is the character of the circuit, and every
one of those numbers is asserted in the test suite.

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

## Latency

**This node delays its output by 16 samples** — 0.33 ms at 48 kHz, and 16
samples at any sample rate. Earlier releases had none.

Seven of the nine models saturate, and a saturating filter folds its own
harmonics back down as inharmonic aliasing. They are therefore rendered at
twice the sample rate, with a polyphase FIR resampler either side, and a
symmetric FIR delays by half its length. The two Korg 35 models are linear and
do not resample, and are delayed to match so that changing `type` does not
shift the output.

If you are summing this node with a dry path, compensate.

## Credits

Three of the five circuits are transcriptions of the Faust virtual analog filter
library
([`vaeffects.lib`](https://github.com/grame-cncm/faustlibraries/blob/master/vaeffects.lib)
1.5.0): `ve.korg35LPF`, `ve.korg35HPF`, `ve.diodeLadder` and `ve.oberheim`, all
by Eric Tarr and declared under the STK-4.3 licence.

The two ladders began there too — `ve.moogLadder` by Dario Sanfilippo and
`ve.moogHalfLadder` by Eric Tarr — and their linear TPT cores still are. Their
saturating feedback paths are not: `vaeffects.lib` says of those functions that
they have "no nonlinearities", which is accurate about the code it ships. The
nonlinearity here is Huovilainen's differential pair (_Non-linear Digital
Implementation of the Moog Ladder Filter_, DAFx 2004) with the delay-free loop
it creates resolved by the discrete-time method in Chowdhury's _A Review of
Methods for Resolving Delay-Free Loops_. Both are papers; no third-party code
was copied for it.

Full notice in [LICENSE.md](LICENSE.md) and in the repository's
[THIRD-PARTY-LICENSES.md](https://github.com/danigb/synthlet/blob/main/THIRD-PARTY-LICENSES.md).

## License

MIT © [danigb](https://github.com/danigb)
