# Synthlet

[![npm version](https://img.shields.io/npm/v/synthlet)](https://www.npmjs.com/package/synthlet)

Collection of synth modules implemented as AudioWorklet in Typescript.

```ts
import { Lfo } from "synthlet";

const context = new AudioContext();
const synth = Lfo(context, { waveform: LfoWaveform.RandSampleAndHold });
```

#### Why

Basically, to learn and for others to learn from. Most open source synths are written in C or some other low level language. This library is written in Typescript to make it more accessible (at the cost of performance).
