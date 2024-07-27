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

- https://github.com/BillyDM/awesome-audio-dsp
- https://paulbatchelor.github.io/sndkit/algos/
