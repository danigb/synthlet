import { SVFilter } from "./filter";

export class Processor extends AudioWorkletProcessor {
  static parameterDescriptors = [
    {
      name: "frequency",
      defaultValue: 1000,
      minValue: 16,
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

  u: ReturnType<typeof SVFilter>;
  r: boolean; // running

  constructor() {
    super();
    this.u = SVFilter(sampleRate);
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
    let input = inputs[0][0];
    let output = outputs[0][0];
    if (input && output) {
      this.u.fill(input, output, parameters);
    }
    return this.r;
  }
}

registerProcessor("StateVariableFilterWorkletProcessor", Processor);
