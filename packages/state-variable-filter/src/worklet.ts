import { SVFilter } from "./dsp";

export class Processor extends AudioWorkletProcessor {
  static parameterDescriptors = [
    {
      name: "filterType",
      defaultValue: 1,
      minValue: 0,
      maxValue: 3,
      automationRate: "k-rate",
    },
    {
      name: "frequency",
      defaultValue: 1000,
      minValue: 20,
      maxValue: 20000,
      automationRate: "k-rate",
    },
    {
      name: "resonance",
      defaultValue: 0.5,
      minValue: 0,
      maxValue: 40,
      automationRate: "k-rate",
    },
  ];

  f: ReturnType<typeof SVFilter>;
  r: boolean; // running

  constructor() {
    super();
    this.f = SVFilter(sampleRate);
    this.r = true;
    this.port.onmessage = (event) => {
      switch (event.data.type) {
        case "STOP":
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
    const input = inputs[0][0];
    const output = outputs[0][0];
    this.f.update(parameters);
    if (input && output) {
      this.f.fill(input, output);
    }
    return this.r;
  }
}

registerProcessor("StateVariableFilterWorkletProcessor", Processor);
