import { WavetableOscillator } from "./wavetable-oscillator";

export class WavetableOscillatorWorkletProcessor extends AudioWorkletProcessor {
  static parameterDescriptors = [
    {
      name: "baseFrequency",
      defaultValue: 220,
      minValue: 0,
      maxValue: 20000,
      automationRate: "k-rate",
    },
    {
      name: "frequency",
      defaultValue: 440,
      minValue: 0,
      maxValue: 20000,
      automationRate: "k-rate",
    },
    {
      name: "morphFrequency",
      defaultValue: 0.05,
      minValue: 0,
      maxValue: 10,
      automationRate: "k-rate",
    },
  ];

  u: ReturnType<typeof WavetableOscillator>; // unit
  r: boolean; // running

  constructor() {
    super();
    this.u = WavetableOscillator(sampleRate);
    this.r = true;
    this.port.onmessage = (event) => {
      switch (event.data.type) {
        case "WAVETABLE":
          this.u.set(event.data.wavetable, event.data.wavetableLength);
          break;
        case "DISCONNECT":
          this.r = false;
          break;
      }
    };
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: any
  ) {
    this.u.agen(outputs[0][0], parameters);
    return this.r;
  }
}

registerProcessor(
  "WavetableWorkletProcessor",
  WavetableOscillatorWorkletProcessor
);
