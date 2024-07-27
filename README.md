# Synthlet

[![npm version](https://img.shields.io/npm/v/synthlet)](https://www.npmjs.com/package/synthlet)

Collection of synth modules implemented as AudioWorklets.

```ts
import {
  registerSynthletOnce,
  createVca,
  createStateVariableFilter
  createPolyblepOscillator,
} from "synthlet";

const audioContext = new AudioContext();
await registerSynthletOnce(audioContext);

// Simplest synth: Oscillator -> Filter -> Amplifier
const osc = createPolyblepOscillator(audioContext, { type: "saw", frequency: 440 });
const filter = createStateVariableFilter(audioContext, { type: "lowpass", frequency: 4000 });
const vca = createVca(audioContext, { attack: 0.1, release: 0.5 });
osc.connect(filter).connect(vca).connect(audioContext.destination);

// Change parameters
osc.frequency.value = 1200;

// Start sound
vca.gateOn();

// Stop sound
vca.gateOff();
```

## Install

Install `synthlet` to install all modules:

```bash
npm i synthlet
```

Or each module individually:

```bash
npm i @synthlet/adsr
```

## Documentation

#### Oscillators

- [PolyblepOscillator](/packages/polyblep-oscilllator)
- [WavetableOscillator](/packages/wavetable-oscilllator)
- [Noise](/packages/noise)

#### Envelopes

- [ADSR](/packages/adsr)

#### Modulators

- [StateVariableFilter](/packages/state-variable-filter)

## References

This library wouldn't be possible with all the people writing books, blog posts and awesome libraries... and making music! Thanks to all 💚

### Books

- [Designing Synth Plugins 2nd Edition](https://www.willpirkle.com/)
- [Developing Virtual Synthesizers with VCV Rack](https://www.routledge.com/Developing-Virtual-Synthesizers-with-VCV-Rack/Gabrielli/p/book/9780367077730)
- [BasicSynth: Creating a Music Synthesizer in Software](http://basicsynth.com/)
- [Generating Sound and Organizing Time](https://cycling74.com/books/go)
- [Designing Audio FX Plugins 2nd Edition](https://www.willpirkle.com/)

### Posts and papers

- https://github.com/BillyDM/awesome-audio-dsp
- https://paulbatchelor.github.io/sndkit/algos/
- https://www.musicdsp.org/
- [Cytomic technical papers](https://cytomic.com/technical-papers/) specially famous for its [State Variable Filters](https://cytomic.com/files/dsp/SvfLinearTrapOptimised2.pdf)
- [Signalsmith Audio blog](https://signalsmith-audio.co.uk/writing/)
- [Valhalla DSP Blog](https://valhalladsp.com/category/learn/plugin-design-learn/)
- http://synthworks.eu/ - DIY Synthetizers
- [Karplus-Strong original paper](https://users.soe.ucsc.edu/~karplus/papers/digitar.pdf)

### Open source repositories

- https://github.com/VCVRack/Rack
- https://github.com/grame-cncm/faust
- https://github.com/SoundStacks/cmajor
- https://github.com/jd-13/WE-Core
- https://github.com/mhetrick/nonlinearcircuits
- https://github.com/timowest/analogue
- https://github.com/pichenettes/stmlib/tree/master/dsp

### Other

- [Wave Edit wavetable editor](https://waveeditonline.com/)

## License

MIT License
