export class ImpulseProcessor extends AudioWorkletProcessor {
  r: boolean; // running
  g: boolean; // gate

  constructor() {
    super();
    this.r = true;
    this.g = false;
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
    outputs[0][0].fill(0);

    if (parameters.gate[0] === 1) {
      if (!this.g) {
        this.g = true;
        outputs[0][0][0] = 1;
      }
    } else {
      this.g = false;
    }

    return this.r;
  }

  static get parameterDescriptors() {
    return [["gate", 0, 0, 1]].map(
      ([name, defaultValue, minValue, maxValue]) => ({
        name,
        defaultValue,
        minValue,
        maxValue,
        automationRate: "k-rate",
      })
    );
  }
}

registerProcessor("ImpulseProcessor", ImpulseProcessor);
