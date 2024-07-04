export class NoiseWorkletProcessor extends AudioWorkletProcessor {
  static parameterDescriptors = [];

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
    for (let i = 0; i < outputs[0][0].length; i++) {
      outputs[0][0][i] = Math.random() * 2 - 1;
    }
    return this.r;
  }
}

registerProcessor("NoiseWorkletProcessor", NoiseWorkletProcessor);
