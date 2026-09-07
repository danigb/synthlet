# @synthlet/adsr

> Attack-Decay-Sustain-Release envelope generator, as an AudioWorklet

Part of [Synthlet](https://github.com/danigb/synthlet)

Web Audio has no envelope generator. This is one, in two shapes:
`AdsrAmp` is an amplifier — one input, multiplied by the envelope — and
`AdsrEnv` is a modulator with no input, to connect at any `AudioParam`.

## Install

```bash
npm i @synthlet/adsr
```

Or `npm i synthlet` for every module, from which the same names are exported.

## AdsrAmp

The envelope as a VCA. Register the worklet on the context first, then build
the graph the ordinary way:

```ts
import { registerAdsrWorklet, AdsrAmp } from "@synthlet/adsr";

const ac = new AudioContext();
await registerAdsrWorklet(ac);

const amp = AdsrAmp(ac, {
  attack: 0.01,
  decay: 0.1,
  sustain: 0.7,
  release: 0.3,
});

const osc = new OscillatorNode(ac, { frequency: 440 });
osc.start();
osc.connect(amp).connect(ac.destination);

amp.gate.setValueAtTime(1, ac.currentTime); // note on
amp.gate.setValueAtTime(0, ac.currentTime + 0.5); // note off

// ...when you're done with it
amp.dispose();
```

Registration is asynchronous and has to happen before you create anything:
an `AudioWorkletProcessor` can't fetch its own code, so it must be installed on
the context first. Everything after that is synchronous.

Modules are functions, not classes, so there's no `new`. They start themselves,
so there's no `start()`.

An `AdsrAmp` whose input is disconnected, or whose source has stopped, reads as
silence rather than failing. You can leave one in the graph between notes and
reconnect a source later; it keeps running either way.

## AdsrEnv

The same envelope with no input, to modulate something else. `gain` and
`offset` scale the `0…1` envelope into whatever units the destination wants —
here a filter sweep from 200 Hz to 2200 Hz:

```ts
import { registerAdsrWorklet, AdsrEnv } from "@synthlet/adsr";

const ac = new AudioContext();
await registerAdsrWorklet(ac);

const filter = new BiquadFilterNode(ac, { type: "lowpass" });

const env = AdsrEnv(ac, {
  attack: 0.05,
  decay: 0.4,
  sustain: 0.2,
  release: 0.5,
  gain: 2000,
  offset: 200,
});

env.connect(filter.frequency);
env.gate.setValueAtTime(1, ac.currentTime);
```

Both factories share one processor, so a single `registerAdsrWorklet` covers
them both.

## Parameters

Every parameter is an `AudioParam`, so it can be set, scheduled, or driven by
another node. Times are in **seconds**.

| Param     | Default | Min    | Max   | Meaning                                             |
| --------- | ------- | ------ | ----- | --------------------------------------------------- |
| `gate`    | 0       | 0      | 1     | Opens the envelope while positive, releases it at 0 |
| `attack`  | 0.01    | 0      | 10    | Time to reach full level                            |
| `decay`   | 0.1     | 0      | 10    | Time from full level down to `sustain`              |
| `sustain` | 0.5     | 0      | 1     | Level held while the gate stays open                |
| `release` | 0.3     | 0      | 10    | Time from the current level down to zero            |
| `offset`  | 0       | -20000 | 20000 | Added to the output                                 |
| `gain`    | 1       | -20000 | 20000 | Multiplies the output                               |

`AdsrEnv` outputs `envelope × gain + offset`; `AdsrAmp` outputs
`input × envelope × gain + offset`. The same list is available at runtime as
`AdsrEnv.descriptors` / `AdsrAmp.descriptors`, if you're generating UI from it.

A parameter accepts a node wherever it accepts a number, which is how you
modulate one — here with an `Lfo`, from the umbrella package:

```ts
import { AdsrEnv, Lfo, LfoType } from "synthlet";

// A slow sine between 0.25 and 0.75, driving the sustain level
const wobble = Lfo(ac, {
  type: LfoType.Sine,
  frequency: 0.3,
  gain: 0.25,
  offset: 0.5,
});
const env = AdsrEnv(ac, { sustain: wobble });
```

Parameters are also reachable on the node:

```ts
const env = AdsrEnv(ac, { attack: 0.01 });
env.attack.value = 0.2;
```

## The gate

The envelope is open while `gate` is positive and releases when it returns to
zero. Any positive value opens it — `1` is the convention, not a requirement —
so an attenuated or scaled gate line still works.

`gate` is read once per render block (~2.9 ms at 44.1 kHz), so a note on and a
note off in the same tick is invisible to the worklet:

```ts
// Wrong: nothing is left for the processor to see
amp.gate.value = 1;
amp.gate.value = 0;

// Right: schedule the edges
amp.gate.setValueAtTime(1, ac.currentTime);
amp.gate.setValueAtTime(0, ac.currentTime + 0.5);
```

**Don't smooth a gate line.** Use `setValueAtTime` or
`linearRampToValueAtTime`; `setTargetAtTime` approaches zero without ever
arriving, so the envelope never releases. The envelope is the smoother — that's
what it's for.

## Retrigger is legato

Opening the gate again during the release phase resumes the attack **from the
current level**, rather than restarting from zero. A quick re-press continues
from where the release got to, so there's no click and no dropout. This is
Redmon's behaviour, and it is the only mode: there is no retrigger parameter.

If you want a hard restart, close the gate long enough for the release to reach
zero before reopening it.

## Sustain changes apply instantly

While the envelope is sustaining, the output tracks `sustain` sample by sample.
Automating `sustain` mid-note steps to the new value rather than gliding to it,
which can click at audio-rate amplitudes. Change it between notes, or ramp the
`gain` instead.

## Offset is silence

The envelope outputs `offset` when the gate is closed, so a non-zero `offset`
is a permanent DC floor under an `AdsrAmp` — the amplifier never goes fully
quiet. Leave `offset` at `0` unless you specifically want that floor, which is
usually only when driving a parameter that shouldn't reach zero:

```ts
// A filter that sweeps 200 Hz -> 2200 Hz and rests at 200 Hz, not at 0 Hz
const env = AdsrEnv(ac, { gain: 2000, offset: 200 });
```

## Credits

Based on Nigel Redmon's ADSR code
([earlevel.com](https://www.earlevel.com/main/2013/06/01/EG-generators/)), with
two TCO constants from [Will Pirkle](https://www.willpirkle.com/)'s
[SynthLab](https://github.com/willpirkleaudio/SynthLab) (Tritone Systems).

See the repository's
[THIRD-PARTY-LICENSES.md](https://github.com/danigb/synthlet/blob/main/THIRD-PARTY-LICENSES.md).

## License

MIT © [danigb](https://github.com/danigb)
