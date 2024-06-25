# @synthlet/adsr

> ADSR (Attack Decay Sustain Release) envelope generator module for [synthlet](https://github.com/danigb/synthlet)

```ts
import { getWorkletUrl, getProcessorName } from "@synthlet/adsr";

const audioContext = new AudioContext();
// You only need to register once
await audioContext.audioWorklet.addModule(getWorkletUrl());

// Create the adsr envelope generator
const adsr = new AudioWorkletNode(audioContext, getProcessorName(), {
  numberOfInputs: 1,
  numberOfOutputs: 1,
  processorOptions: {
    mode: "audio",
  },
});
adsr.connect(audioContext.destination);

const osc = new OscillatorNode(audioContext);
osc.start();
osc.connect(adsr);

// Start the envelope
adsr.params.gate.setValue(1);

// Release the envelop
adsr.params.gate.setValue(0);
```

## Install

```
npm i @synthlet/adsr
```

## Usage

Register and create the audio worklet

```ts
import { getWorkletUrl, getProcessorName } from "@synthlet/adsr";

const audioContext = new AudioContext();
// You only need to register once
await audioContext.audioWorklet.addModule(getWorkletUrl());
const adsr = new AudioWorkletNode(audioContext, getProcessorName(), {
  numberOfInputs: 1,
  numberOfOutputs: 1,
  processorOptions: {
    mode: "audio",
  },
});
```

#### `processorOptions`

- `mode`: how the adsr operate

  - `audio`: modulate an input audio signal amplitude with the ADSR envelope
  - `control`: generate a k-rate envelope used to control other parameters
