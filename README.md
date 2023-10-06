# Synthlet

[![npm version](https://img.shields.io/npm/v/synthlet)](https://www.npmjs.com/package/synthlet)

Collection of synth modules implemented as AudioWorklets written in Typescript. Currently, dsp is mostly a port of Will Pirkle's Audio Effects Plugins in C++ 2nd Ed. book. Thanks Will 🙌

```ts
import { loadSynthlet } from "synthlet";

const { osc, filter, chain, adsr, now, trigger, param } = loadSynthlet(context);

// A WebAudio normal oscillator

const gate = trigger();
const frequency = param(440);

const disconnect = chain(
  mix(
    osc({ type: AvOscillator.SAW, frequency, detune: 2 }),
    osc({ type: AvOscillator.SAW, frequency, detune: -2 })
  ),
  filter({ frequency: 3000 }),
  adsr({ gate }),
  context.destination
);

gate.noteOn(now());
frequency.setValueAtTime(880, now() + 0.5);
gate.noteOff(now() + 1);

disconnect();
```

⚠️ This is extremely alpha software. Use at your own risk (and be careful with volume and filter resonance)

#### Why

Basically, to learn and for others to learn from. Most open source synths are written in C or some other low level language. This library is written in Typescript to make it more accessible (at the cost of performance).

#### References

- [Designing Synth Plugins 2nd Edition](http://www.willpirkle.com/)
- [BasicSynth: Creating a Music Synthesizer in Software](https://basicsynth.com/index.php?page=book)

#### Roadmap

- Envelope Generators
  - [x] ADSR
  - [ ] ASD
  - [ ] AD
- [ ] LFO
  - [x] Sin, Saw
  - [x] Sample&Hold
- [ ] VA Oscillator
  - [x] Blep algorithms
  - [x] Noise algorithms
- [ ] Wavetable Oscillator
- [ ] PCM Oscillator
- [-] KarplusString Oscillator
- [ ] Granular Oscillator
- [ ] VA Filters
  - [x] 1-pole
  - [x] 2-pole
  - [x] Korg35
  - [ ] Moog
  - [ ] Diode

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

const Synthlet = await loadSynthlet(new AudioContext());

const osc = Synthlet.osc({ frequency: 440 }).connect(destination);

// after some time...
osc.disconnect();
```

But you can choose which ones to load if you don't need or want the full library:

```js
import { loadKarplusStrongOscillator } from "synthlet";

const ks = await loadKarplusStrongOscillator(context);

const osc = ks({ note: 60 }).connect(context.destination);
osc.disconnect();
```

#### Create nodes

The load function returns a promise to a function that create audio nodes:

```js
import { loadLfo } from "synthlet";

const createLfo = await loadLfo(context);
const lfo = createLfo({ frequency: 10 }); // lfo is an AudioNode
```

#### Connect nodes

Each node is a normal WebAudio API `AudioNode` so the same principles apply:

```js
const osc = new OscillatorNode(context, { frequency: 440 });
lfo.connect(osc.frequency);
osc.start();
```

## Modules

#### ADSR

An attack-decay-sustain-release envelope.

#### Lfo

A low frequency oscillator with several waveforms and extras.

#### Virtual Analog Oscillator

Oscillator based on Blip algorithm
