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

#### Roadmap

- Envelope
  - [x] ADSR
  - [ ] ASD
  - [ ] AD
- [-] LFO
  - [x] Sin, Saw
  - [x] Sample&Hold
- [-] VA Oscillator
  - [x] Blep algorithms
  - [x] Noise algorithms
- [ ] Wavetable Oscillator
- [-] KarplusString Oscillator
- [ ] Granular Oscillator

## Setup

#### Package

Install using npm or any other package manager:

```bash
npm i synthlet
```

#### Browser

## Usage

#### Load worklets

The first step is to load the worklets into an AudioContext. The simplest way is to load them all:

```js
import { loadSynthlet } from "synthlet";

const context = new AudioContext();
await loadSynthlet(context);
```

But you can choose which ones to load if you don't need the full library:

```js
import { loadKarplusStrongOscillator } from "synthlet";

await loadKarplusStrongOscillator(context);
```

#### Create nodes

You can create the nodes using the constructor functions:

```js
import { Lfo } from "synthlet";

const lfo = Lfo(context, { frequency: 10 });
```

⚠️ Don't use `new` in front ot the function.

#### Connect nodes

Each node is a normal WebAudio API `AudioNode` so the same principles apply:

```js
const osc = new OscillatorNode(context);
lfo.connect(osc.detune);
```

## Modules

#### ADSR

An attack-decay-sustain-release envelope.

#### Lfo

A low frequency oscillator with several waveforms and extras.

#### Virtual Analog Oscillator

Oscillator based on Blip algorithm
