import { createChorus } from "./dsp";

export class ChorusTWorkletProcessor extends AudioWorkletProcessor {
  r: boolean; // running
  p: ReturnType<typeof createChorus>;

  constructor() {
    super();
    this.r = true;
    this.p = createChorus(sampleRate);
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
    if (inputs.length < 1 || outputs.length < 1) {
      // no inputs, do nothing
    } else if (parameters.bypass[0] === 1) {
      // Bypass: copy input(s) to outputs
      const mono = inputs[0].length === 1;
      outputs[0][1].set(inputs[0][0]);
      outputs[0][0].set(inputs[0][mono ? 0 : 1]);
    } else {
      this.p.update(
        parameters.enable1[0],
        parameters.enable2[0],
        parameters.lfoRate1[0],
        parameters.lfoRate2[0]
      );
      this.p.process(inputs[0], outputs[0]);
    }

    return this.r;
  }

  static get parameterDescriptors() {
    return [
      ["bypass", 0, 0, 1],
      ["enable1", 1, 0, 1],
      ["enable2", 1, 0, 1],
      ["lfoRate1", 0.5, 0, 1],
      ["lfoRate2", 0.83, 0, 1],
    ].map(([name, defaultValue, minValue, maxValue]) => ({
      name,
      defaultValue,
      minValue,
      maxValue,
      automationRate: "k-rate",
    }));
  }
}

registerProcessor("ChorusTWorkletProcessor", ChorusTWorkletProcessor);
