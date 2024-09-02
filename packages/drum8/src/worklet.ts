export class Drum8WorkletProcessor extends AudioWorkletProcessor {
  r: boolean; // running

  constructor() {
    super();
    this.r = true;
    this.port.onmessage = (event) => {
      switch (event.data.type) {
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
    const output = outputs[0][0];
    const gate = parameters.gate[0];

    for (let i = 0; i < outputs[0][0].length; i++) {
      output[i] = gate === 1 ? Math.random() * 2 - 1 : 0;
    }
    return this.r;
  }

  static get parameterDescriptors() {
    return [
      ["gate", 0, 0, 1],
      ["attack", 0.01, 0, 10],
      ["decay", 0.1, 0, 10],
      ["hold", 0, 0, 10],
    ].map(([name, defaultValue, minValue, maxValue]) => ({
      name,
      defaultValue,
      minValue,
      maxValue,
      automationRate: "k-rate",
    }));
  }
}

registerProcessor("Drum8WorkletProcessor", Drum8WorkletProcessor);
