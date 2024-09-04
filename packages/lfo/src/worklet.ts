import { Lfo, LfoWaveform } from "./lfo";

export class LfoWorkletProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      ["waveform", 1, 0, LfoWaveform.RandSampleHold],
      ["frequency", 10, 0, 200],
      ["gain", 1, 0, 10000],
      ["offset", 0, -1000, 1000],
    ].map(([name, defaultValue, minValue, maxValue]) => ({
      name,
      defaultValue,
      minValue,
      maxValue,
      automationRate: "k-rate",
    }));
  }

  r: boolean; // running
  u: ReturnType<typeof Lfo>;

  constructor(options: any) {
    super();
    const waveform = options?.processorOptions?.waveform ?? LfoWaveform.Sine;
    this.u = Lfo(sampleRate, waveform);
    this.r = true;
    this.port.onmessage = (event) => {
      switch (event.data.type) {
        case "DISPOSE":
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
    this.u.kgen(outputs[0][0], parameters);
    return this.r;
  }
}

registerProcessor("LfoProcessor", LfoWorkletProcessor);
