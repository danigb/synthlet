# Synthlet

[![npm version](https://img.shields.io/npm/v/synthlet)](https://www.npmjs.com/package/synthlet)

Audio modules for the browser, implemented as AudioWorklets. Each one is a node
you `connect()` into a graph you already have, with `AudioParam`s you automate
the way you automate everything else — filling the gaps Web Audio leaves rather
than replacing it.

```ts
import { registerAdsrWorklet, AdsrAmp } from "synthlet";

const ac = new AudioContext();
await registerAdsrWorklet(ac);

// Web Audio has no envelope generator. This is one.
const amp = AdsrAmp(ac, {
  attack: 0.01,
  decay: 0.1,
  sustain: 0.7,
  release: 0.3,
});

const osc = new OscillatorNode(ac, { frequency: 440 });
osc.start();
osc.connect(amp).connect(ac.destination);

amp.gate.value = 1; // note on
// ...later
amp.gate.value = 0; // note off
```

Modules are functions, not classes, so there's no `new`. They start themselves,
so there's no `start()`. Everything else is a normal Web Audio node.

## Install

Install `synthlet` for everything:

```bash
npm i synthlet
```

Or install a single module — each one is a standalone package with no
dependencies:

```bash
npm i @synthlet/adsr
```

## Building a graph

Synthlet nodes connect to each other and to native nodes with the ordinary
`connect()`. `registerAllWorklets` registers every module at once and returns
the context, so it chains:

```ts
import {
  registerAllWorklets,
  PolyblepOscillator,
  Svf,
  SvfType,
  AdsrAmp,
} from "synthlet";

const ac = await registerAllWorklets(new AudioContext());

const osc = PolyblepOscillator(ac, { frequency: 110 });
const filter = Svf(ac, { type: SvfType.LowPass, frequency: 1200, Q: 4 });
const amp = AdsrAmp(ac, {
  attack: 0.01,
  decay: 0.2,
  sustain: 0.6,
  release: 0.4,
});

osc.connect(filter).connect(amp).connect(ac.destination);

amp.gate.setValueAtTime(1, ac.currentTime);
amp.gate.setValueAtTime(0, ac.currentTime + 0.5);
```

Registration is asynchronous and has to happen before you create anything — an
`AudioWorkletProcessor` can't fetch its own code, so it must be installed on the
context first. Everything after that is synchronous.

A parameter accepts a node wherever it accepts a number, which is how you
modulate:

```ts
import {
  registerAllWorklets,
  Lfo,
  LfoType,
  PolyblepOscillator,
} from "synthlet";

const ac = await registerAllWorklets(new AudioContext());

const vibrato = Lfo(ac, { type: LfoType.Sine, frequency: 5, gain: 6 });
const osc = PolyblepOscillator(ac, { frequency: 220, detune: vibrato });

osc.connect(ac.destination);
```

## Something complete

`MonoSynth` and the drums are whole instruments built out of those modules. They
expose their own parameters, and the modules they're made of:

```ts
import {
  registerDrums,
  registerMonoSynth,
  MonoSynth,
  KickDrum,
} from "synthlet";

// Each compound registers only what it's made of, and they compose
const ac = new AudioContext();
await Promise.all([registerMonoSynth(ac), registerDrums(ac)]);

const synth = MonoSynth(ac, { frequency: 220 });
synth.connect(ac.destination);

synth.gate.setValueAtTime(1, ac.currentTime);
synth.gate.setValueAtTime(0, ac.currentTime + 0.5);

// The modules it's made of are on the synth
synth.osc.frequency.value = 330;
synth.filter.frequency.value = 900;

const kick = KickDrum(ac, { tone: 0.4, decay: 0.6 });
kick.connect(ac.destination);
kick.trigger.setValueAtTime(1, ac.currentTime);
kick.trigger.setValueAtTime(0, ac.currentTime + 0.01);

// dispose() tears down the whole internal graph
synth.dispose();
kick.dispose();
```

`trigger` and `gate` are `AudioParam`s, and every gate and trigger in the
library is `a-rate`: a note lands on the sample it was scheduled for rather than
at the top of the next render block, and two triggers inside one block both
fire. For a one-shot, schedule both edges with `setValueAtTime` as above —
setting `.value` to 1 and back to 0 in the same tick leaves nothing for the
worklet to see, because only the last write survives.

## Making your own compound

`MonoSynth` and the drums aren't special. `Compound` is the declaration they're
built on, and it makes a group of modules behave as one: a single node to
connect from, a public surface you choose, and one `dispose()` that tears down
everything inside.

```ts
import { Compound, Param, PolyblepOscillator, Svf, SvfType } from "synthlet";

function Voice(ac: AudioContext) {
  const osc = PolyblepOscillator(ac, { frequency: 110 });
  const cutoff = Param(ac, { input: 1200 });
  const filter = Svf(ac, { type: SvfType.LowPass, frequency: cutoff });
  osc.connect(filter);

  return Compound({
    output: filter,
    owns: [osc, cutoff],
    exposes: { cutoff: cutoff.input, osc, filter },
  });
}

const voice = Voice(ac);
voice.connect(ac.destination);
voice.cutoff.value = 400; // an inlet the compound chose to expose
voice.dispose(); // tears down osc, cutoff and filter
```

`owns` is what `dispose()` tears down — the nodes you connected by hand.
Anything passed _to_ a factory is already owned by the module it was passed to.
`exposes` is the public surface: an `AudioParam`, a `Param` node's `.input`
where an inlet needs scaling or fan-out, or the modules themselves.

Every factory also carries the parameters its processor declares, so a UI can be
built from the module rather than from a hard-coded table:

```ts
Svf.descriptors;
// [{ name: "type", defaultValue: 1, minValue: 0, maxValue: 6, automationRate: "k-rate" }, …]
```

## Modules

**Sources** — `PolyblepOscillator`, `WavetableOscillator`, `KarplusStrong`,
`Noise`, `Impulse`, `TimestretchAudioSource` (a buffer player with independent
time and pitch)

**Modifiers** — `Svf` (state variable filter), `VirtualAnalogFilter` (Moog
ladder, Korg 35, diode ladder, Oberheim), `ClipAmp`, `AdsrAmp`, `AdAmp`,
`RingMod` (ring and amplitude modulation), `LookaheadLimiter` (true-peak
brickwall), `LevelMeter`

**Modulators** — `AdsrEnv`, `AdEnv`, `Lfo`, `Param`, `SampleHold`,
`EnvelopeFollower`, `SlewLimiter` (portamento)

**Sequencers** — `Clock`, `Euclid`, `Arp`

**Effects** — `DigitalDelay`, `AnalogDelay` (tape and bucket-brigade), `Chorus`,
`ReverbDelay`, `DattorroReverb`, `Granite` (granular delay)

**Instruments** — `MonoSynth`, and eleven drums: `KickDrum`, `SnareDrum`,
`HiHatDrum`, `ClaveDrum`, `CowBellDrum`, `CymbalDrum`, `MaracasDrum`,
`HandclapDrum`, `TomDrum`, `CongaDrum`, `MembraneDrum`

Every module has a matching `register<Name>Worklet` function if you'd rather not
register all of them.

## Documentation

Documentation and live examples are
[here](https://danigb.github.io/synthlet/docs/quick-start).

## What this is

Web Audio gives you oscillators, filters and gains, and then stops. There's no
noise node, no envelope generator, no reverb that doesn't need you to source an
impulse response, no level meter without an `AnalyserNode` and a
`requestAnimationFrame` loop, and a `DynamicsCompressorNode` that most people
consider unusable as a limiter. Synthlet is a module for each of those, shaped
like the nodes you already use.

**Why TypeScript?** Because a module needs no build step to read, hack or debug,
and JS engines optimise this kind of code well enough. It's a tradeoff, not a
principle — WASM is open where the DSP warrants it, and packaging is designed to
hide which one you're using.

**Why one package per module?** So `npm i @synthlet/adsr` gets you an envelope
generator and nothing else. The shared runtime is copied into each package
rather than extracted into a dependency, deliberately.

**It's not a music framework.** No transport, no bar/beat scheduling, no note
names. If you want those, [Tone.js](https://github.com/Tonejs/Tone.js) has them,
and a synthlet module connects into a Tone.js graph like any other node.

## References

This library wouldn't be possible with all the people writing books, blog posts and awesome libraries... and making music! Thanks to all 💚

### Books

- [Designing Synth Plugins 2nd Edition](https://www.willpirkle.com/)
- [Developing Virtual Synthesizers with VCV Rack](https://www.routledge.com/Developing-Virtual-Synthesizers-with-VCV-Rack/Gabrielli/p/book/9780367077730)
- [BasicSynth: Creating a Music Synthesizer in Software](http://basicsynth.com/)
- [Generating Sound and Organizing Time](https://cycling74.com/books/go)
- [Designing Audio FX Plugins 2nd Edition](https://www.willpirkle.com/)

### Blogs and papers

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
- [Surge synth](https://github.com/surge-synthesizer/surge)
- [Surge Rust](https://github.com/klebs6/surge-rs)
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
