# Synthlet

[![npm version](https://img.shields.io/npm/v/synthlet)](https://www.npmjs.com/package/synthlet)

Collection of synth modules implemented as AudioWorklets.

```ts
import {
  registerSynthletOnce,
  createAdsr,
  createWavetableOscillator,
} from "synthlet";

const audioContext = new AudioContext();
await registerSynthletOnce(audioContext);

// Simplest synth: Oscillator -> Filter -> Amplifier
const osc = createWavetableOscillator(audioContext);
const filter = createStateVariableFilter(audioContext);
const vca = createVca(audioContext);

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

- [ADSR](/packages/adsr/README.md)
- [Noise](/packages/noise/README.md)
- [WavetableOscillator](/packages/wavetable-oscilllator/README.md)
