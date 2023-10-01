# Synthlet

[![npm version](https://img.shields.io/npm/v/synthlet)](https://www.npmjs.com/package/synthlet)

Collection of synth modules implemented as AudioWorklet in Typescript. Currently is basically a port of Will Pirkle's Audio Effects Plugins in C++ 2nd Ed. book. Thanks Will 🙌

```ts
import { Lfo, LfoWaveform, loadSynthlet } from "synthlet";

const context = new AudioContext();
await loadSynthlet(context);

const synth = Lfo(context, { waveform: LfoWaveform.RandSampleAndHold });
```

#### Why

Basically, to learn and for others to learn from. Most open source synths are written in C or some other low level language. This library is written in Typescript to make it more accessible (at the cost of performance).

#### References

- [Designing Synth Plugins 2nd Edition](http://www.willpirkle.com/)
