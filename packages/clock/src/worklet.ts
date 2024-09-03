export class ClockWorkletProcessor extends AudioWorkletProcessor {
  r: boolean; // running
  bpm: number;
  i: number; // increment
  p: number; // phase

  constructor() {
    super();
    this.r = true;
    this.bpm = 120;
    this.i = this.bpm / 60 / sampleRate;
    this.p = 0;
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
    if (parameters.bpm[0] !== this.bpm) {
      this.bpm = parameters.bpm[0];
      this.i = this.bpm / 60 / sampleRate;
    }
    let phase = this.p;
    for (let i = 0; i < outputs[0][0].length; i++) {
      outputs[0][0][i] = phase;
      phase += this.i;
      if (phase >= 1) phase -= 1;
    }
    this.p = phase;
    return this.r;
  }

  static get parameterDescriptors() {
    return [["bpm", 120, 30, 300]].map(
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

registerProcessor("ClockWorkletProcessor", ClockWorkletProcessor);
