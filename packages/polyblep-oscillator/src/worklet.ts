export class Processor extends AudioWorkletProcessor {
  static parameterDescriptors = [
    {
      name: "frequency",
      defaultValue: 1000,
      minValue: 16,
      maxValue: 20000,
      automationRate: "k-rate",
    },
  ];

  r: boolean; // running

  constructor() {
    super();
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
    _inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: any
  ) {
    const output = outputs[0][0];
    return this.r;
  }
}
