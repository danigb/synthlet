# @synthlet/modal-resonator

> A bank of tuned, decaying resonators played from a mode table — kettle drums,
> bells and cowbells as one node each

Part of [Synthlet](https://github.com/danigb/synthlet).

Every percussion chapter of Synth Secrets (Parts 31 to 41) ends the same way: a
table of partials, each with a frequency ratio, a level and a decay, and then a
struggle to play it with four oscillators and four contour generators. This
module plays the table. Strike it with an `Impulse` and it rings every mode at
once.

## Install

```bash
npm i @synthlet/modal-resonator
```

Or `npm i synthlet` for every module at once.

## Usage

```ts
import {
  registerModalResonatorWorklet,
  ModalResonator,
} from "@synthlet/modal-resonator";

const ac = new AudioContext();
await registerModalResonatorWorklet(ac);

const timp = ModalResonator(ac, {
  frequency: 150,
  decay: 2,
  modes: ModalResonator.modes.kettleDrum(),
});
strike.connect(timp).connect(ac.destination); // strike = Impulse(ac, { trigger })

timp.setModes(ModalResonator.modes.bell()); // next render quantum; the ring continues
```

There is no built-in exciter. `Impulse` is a strike, `Noise` through an `AdAmp`
is a brush or a scrape, an oscillator makes it a resonant filter bank.

## Parameters

| Param        | Default | Range     | Rate   | Meaning                                                        |
| ------------ | ------- | --------- | ------ | -------------------------------------------------------------- |
| `frequency`  | 220     | 20 … 5000 | k-rate | Frequency of a ratio-1 mode in Hz; every mode is a ratio of it |
| `decay`      | 1       | 0.01 … 10 | k-rate | Seconds for a mode whose table decay is 1 to fall 60 dB        |
| `brightness` | 1       | 0 … 1     | k-rate | Mode n's level is scaled by `brightness^(n−1)`; 1 is the table |

`frequency` and `decay` are read once per block and **interpolated across it**,
so a pitch envelope on a drum does not zipper and does not change its loudness.

Construction options, not parameters: `maxModes` (default 32, at most 256) sizes
the pool, so swapping tables never allocates; `modes` is the starting table
(default `harmonic(8)`).

## The mode table

A table is a list of `{ ratio, level, decay }`:

- `ratio` — frequency relative to `frequency`.
- `level` — the mode's envelope at the strike of a unit impulse. The output is
  sine-phase, so it starts at zero rather than clicking; the _envelope_ starts
  at `level`, whatever the decay and whatever the pitch.
- `decay` — a multiplier of the node's `decay`.

`setModes(table)` replaces it. Modes in both tables keep ringing from where they
are; modes past the end of the new one stop; a table longer than `maxModes` is
truncated with a `console.warn`.

### Why `decay` means "a table decay of 1", not "mode 1"

Part 32 gives the kettle drum's decays as 45 %, 73 %, 91 % and 84 %, and mode 1
is the 45 %. They go into `kettleDrum()` verbatim, so the drum's first mode
rings for 0.45 × `decay` and one knob still says how long the drum rings. For
`harmonic(n)`, every table decay is 1 and the difference disappears.

## The tables

`ModalResonator.modes` holds pure functions that return tables:

| Table               | From    | What it is                                                                                 |
| ------------------- | ------- | ------------------------------------------------------------------------------------------ |
| `harmonic(n)`       | —       | Ratios 1 … n, each at `1/n`. The default. `harmonic(1)` is claves (Part 41): one mode      |
| `membrane()`        | Part 31 | The twelve Bessel ratios of an ideal membrane — the thump of a drum hit dead centre        |
| `kettleDrum()`      | Part 32 | 1.00 : 1.50 : 1.98 : 2.44, levels 5 : 4 : 3 : 1, decays 45 : 73 : 91 : 84                  |
| `bell()`            | Part 40 | Strike partials 2 : 3 : 4 over a missing fundamental, a beating pair at 2.01, a hum at 0.5 |
| `cowbell()`         | Part 41 | 587 and 845 Hz (1 : 1.44) at `frequency: 587`, each tone as an impact row and a tail row   |
| `stiffString(B, n)` | —       | `k·√(1 + B·k²)`, normalised so mode 1 stays at `frequency`                                 |

Only the ratios of `bell()` and the shape of `cowbell()` are Reid's; their
levels and decays are this library's.

A mode's _spectral_ peak is proportional to its level times its decay, so the
kettle drum's tallest line on a spectrum is mode 3, not the mode 1 that is
loudest at the strike.

## Driving it continuously

Levels are normalised for a **strike**. Anything longer than an impulse is
amplified by the resonance, and a long decay is a very narrow resonance: a unit
sine held on a mode with `decay: 1` peaks at about 3200 (+70 dB), and a 30 ms
noise burst into `harmonic(8)` peaks at 2.57. Put a `Gain` in front of any
exciter that is not an `Impulse` — 0.05 is a reasonable start for a noise burst.

## Mono, deliberately

Input channels are summed and the output is one channel. A body is one object,
and sixty-four resonators per channel would double the cost for a stereo image
that a `StereoPannerNode` after the node gives for free. This is a deliberate
exception to the library's rule that amplifiers process every channel.

## How it works

Each mode is a two-dimensional vector rotated by the mode's frequency and
shrunk by its decay every sample. An impulse sets its length to `level`; from
then on the length is exactly `level · rⁿ`, and it falls 60 dB in the mode's
decay time. Because a rotation preserves length, changing the frequency changes
the pitch and nothing else — the textbook two-pole resonator does not have that
property, and measured 12.9 dB louder at the end of a 2000 → 100 Hz sweep.
Modes at or above `0.45 × sampleRate` are silenced rather than left to alias.

## Not in this module

- **`structure` and `position`**, Rings' ways of filling the table without a
  table. A rule is a function that returns a table; `stiffString` is the first.
- **An exciter.** `Impulse`, `Noise`, `AdAmp` and every oscillator already are.
- **Chaos.** A hard-hit cymbal's modes couple nonlinearly (Part 37); a linear
  bank cannot do that. Mix `Noise` in under a velocity-scaled envelope instead.
