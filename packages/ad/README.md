# @synthlet/ad

> An attack-decay envelope generator, as an audio worklet

Part of [Synthlet](https://github.com/danigb/synthlet).

Two stages and nothing else — the envelope a percussive voice wants. There is
no gate to hold: a rising edge on `trigger` fires the whole shape, and it runs
to silence on its own. Web Audio has no envelope generator at all, so this is
one, in two flavours:

- **`AdEnv`** — no input, the envelope on its output. Connect it to any
  `AudioParam`.
- **`AdAmp`** — one input, multiplied by the same envelope. The percussive
  counterpart of `AdsrAmp`; its output is `input × envelope × gain + offset`.

Both share one processor, so `registerAdWorklet` covers both.

## Install

```bash
npm i @synthlet/ad
```

Or `npm i synthlet` for every module at once.

## Usage

```ts
import { registerAdWorklet, AdEnv, AdAmp } from "@synthlet/ad";

const ac = new AudioContext();
await registerAdWorklet(ac);

// As an amplifier
const amp = AdAmp(ac, { attack: 0.001, decay: 0.25 });
osc.connect(amp).connect(ac.destination);

// As a modulator: a pitch blip on every hit
const env = AdEnv(ac, { attack: 0.001, decay: 0.05, gain: 800 });
env.connect(osc.frequency);

amp.trigger.value = 1; // fire
amp.trigger.value = 0; // arm the next one
```

`trigger` is edge-detected, so it has to fall before it can fire again.

## Parameters

| Param     | Default | Range  | Rate   | Meaning                                            |
| --------- | ------- | ------ | ------ | -------------------------------------------------- |
| `trigger` | 0       | 0 … 1  | a-rate | Rising edge fires the envelope                     |
| `attack`  | 0.01    | 0 … 10 | k-rate | **Seconds** from silence to the peak               |
| `decay`   | 0.1     | 0 … 10 | k-rate | **Seconds** from the peak back to silence (−60 dB) |
| `gain`    | 1       | ±20000 | k-rate | How far the envelope travels                       |
| `offset`  | 0       | ±20000 | k-rate | Where it sits at rest                              |

`trigger` is `a-rate`, so a note lands on the sample it was scheduled for, and
two triggers inside one render quantum both fire. Being an `AudioParam`, it
accepts a number, an `Lfo`, a `Clock`'s gate or any other node.

`attack` and `decay` are exact times, linear in the parameter, and the same
seconds `@synthlet/adsr` uses — `AdEnv(ac, { attack: 0.5, decay: 2 })` peaks
at 0.5 s and is silent 2 s later.

An `AdAmp` with nothing connected to its input outputs `offset` rather than
failing.

## Credits

The attack-decay envelope follows the approach described in
[sndkit](https://paulbatchelor.github.io/sndkit/env/) by Paul Batchelor,
released under [The Unlicense](https://unlicense.org/).

See the repository's
[THIRD-PARTY-LICENSES.md](https://github.com/danigb/synthlet/blob/main/THIRD-PARTY-LICENSES.md).

## License

MIT © [Daniel Gómez Blasco](https://github.com/danigb)
