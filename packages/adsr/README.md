# @synthlet/adsr

> ADSR (Attack Decay Sustain Release) envelope generator module for [synthlet](https://github.com/danigb/synthlet)

```ts
import { registerAdsrWorklet, createVca } from "@synthlet/adsr";

const audioContext = new AudioContext();

await registerAdsrWorklet(audioContext);

// Create a VCA (Voltage Controlled Amplifier)
const vca = createVca({ attack: 0.1, decay: 0.1, sustain: 0.7, release: 0.3 });
// Connect the vca to the output
vca.connect(audioContext.destination);

// Connect an oscillator to the vca
const osc = new OscillatorNode(audioContext);
osc.start();
osc.connect(vca);

// Start and release the VCA
vca.gateOn(audioContext.now);
vca.gateOff(audioContext.now + 1);
```

## Install

```
npm i @synthlet/adsr
```

## Usage

### Register

You need to register the audio worklet before usage:

```ts
import { registerAdsrWorklet } from "@synthlet/adsr";
const context = new AudioContext();
await registerAdsrWorklet(context);
```

### Create

You can create the envelope generator in two modes: as modulator (to control amplitude) or generator (to control other node's parameters)

To use it as a VCA use `createVca` function:

```ts
import { createVca } from "@synthlet/adsr";

const vca = createVca({ attack: 0.1, decay: 0.1, sustain: 0.7, release: 0.2 });
```

To use it as a modulator use `createAdsr` function:

```ts
import { createAdsr } from "@synthlet/adsr";

const adsr = createAdsr({ gain: 1000, offset: 2000 });
adsr.connect(filter.frequency);
```

### Parameters

Parameters can be supplied to the create function and also accessed directly from the node:

```ts
const adsr = createAdsr({ attack: 0.1 });
adsr.attack.value = 0.2;
```

The available parameters are:

- `gate`: triggers and releases the envelope (default: 0, min: 0, max: 1)
- `attack`: duration of attack phase in ms (default: 0.min: 01, max: 0, 1)
- `decay`: duration of decay phase in ms (default: 0.min: 1, max: 0, 1)
- `sustain`: sustain value (default: 0.min: 5, max: 0, 1)
- `release`: duration or release phase in ms (default: 0.min: 3, max: 0, 1)
- `offset`: envelope value offset (default: 0, min: 0, max: 20000)
- `gain`: (default: 1, min: -20000max: , 20000)

### Trigger the attack and release

To trigger the attack phase you can use `gateOn` function with an optional time:

```ts
adsr.gateOn(audioContext.now);
```

To trigger the release phase you can use `gateOff` function with an optional time:

```ts
adsr.gateOff(audioContext.now);
```

Alternatively you can use the `gate` audio param:

```ts
// trigger attack
adsr.gate.value = 1;
// trigger release
adsr.gate.value = 0;
```

The advantage of the `gate` audio param is that it can be connected and therefore controlled from other nodes (like an LFO)

## License

MIT License
