# Synthlet

[![npm version](https://img.shields.io/npm/v/synthlet)](https://www.npmjs.com/package/synthlet)

Collection of synth modules implemented as AudioWorklets.

```ts
import {
  registerAllWorklets,
  AdsrAmp,
  Svf,
  SvfType,
  PolyblepOscillator
} from "synthlet";

const ac = new AudioContext();
await registerAllWorklets(ac);

// Simplest synth: Oscillator -> Filter -> Amplifier
const osc = PolyblepOscillator(ac, { frequency: 440 });
const filter = Svf(ac, {
  type: SvfType.LowPass
  frequency: 4000,
});
const amp = AdsrAmp(ac, { attack: 0.1, release: 0.5 });
osc.connect(filter).connect(amp).connect(ac.destination);

// Change parameters
osc.frequency.value = 1200;

// Start sound
amp.gate.value = 1;

// Stop sound
vca.gate.value = 0;
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

Documentation and examples are [here](https://danigb.github.io/synthlet/docs/quick-start)

### Why?

Mostly, because I want to learn dsp.

### Is it a good idea to write dsp in Typescript?

Probably not, but I've seen [a talk at WAC 2022](https://zenodo.org/records/6767468) about it that made me think it is possible (thanks to JS engine optimizations).

### Should I use it?

Just for fun and curiosity. If you want to make music, [Tone.js](https://github.com/Tonejs/Tone.js) is probably the way to go.

If you want to deploy dsp modules to web in production, currently [Faust](https://faustdoc.grame.fr/) and [Cmajor](https://github.com/cmajor-lang/cmajor) or [Elementary Audio](https://github.com/elemaudio/elementary) are better alternatives.

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
- [Signalsmith Audio blog](https://signalsmith-audio.co.uk/writing/)
- [Valhalla DSP Blog](https://valhalladsp.com/category/learn/plugin-design-learn/)
- http://synthworks.eu/ - DIY Synthetizers
- [Karplus-Strong original paper](https://users.soe.ucsc.edu/~karplus/papers/digitar.pdf)

### Reading / inspiration

Projects worth reading. None of synthlet's code derives from them — see
[THIRD-PARTY-LICENSES.md](THIRD-PARTY-LICENSES.md) for what actually does.

- [Faust](https://github.com/grame-cncm/faust)
- [Cmajor](https://github.com/SoundStacks/cmajor)
- [VCVRack](https://github.com/VCVRack/Rack)
- [The Synthesis ToolKit](https://github.com/thestk/stk)
- https://github.com/jd-13/WE-Core
- https://github.com/mhetrick/nonlinearcircuits
- https://github.com/timowest/analogue
- https://github.com/pichenettes/stmlib/tree/master/dsp

### Other

- [Wave Edit wavetable editor](https://waveeditonline.com/)

## License

MIT License. See [LICENSE.md](LICENSE.md).

Some modules contain DSP derived from third-party work. Those derivations, their
authors and the notices they require are collected in
[THIRD-PARTY-LICENSES.md](THIRD-PARTY-LICENSES.md).
