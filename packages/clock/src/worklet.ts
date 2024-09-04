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
    if (parameters.bpm[0] !== this.bpm) {
      this.bpm = parameters.bpm[0];
      this.i = this.bpm / 60 / sampleRate;
    }
    let nextPhase = this.p + outputs[0][0].length * this.i;
    if (nextPhase > 1) nextPhase -= 1;

    let fill = nextPhase < this.p ? 1 : this.p;

    outputs[0][0].fill(fill);

    this.p = nextPhase;

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
