import { PolyBlep } from "./polyblep";

type Waveform = () => number;

export class Processor extends AudioWorkletProcessor {
  static parameterDescriptors = [
    {
      name: "waveform",
      defaultValue: 1,
      minValue: 0,
      maxValue: 3,
      automationRate: "k-rate",
    },
    {
      name: "frequency",
      defaultValue: 1000,
      minValue: 16,
      maxValue: 20000,
      automationRate: "k-rate",
    },
  ];

  r: boolean; // running
  p: PolyBlep;
  w: Waveform[];

  constructor() {
    super();
    this.r = true;
    this.p = new PolyBlep(sampleRate);
    this.w = [
      this.p.sine.bind(this.p),
      this.p.saw.bind(this.p),
      this.p.square.bind(this.p),
      this.p.triangle.bind(this.p),
    ];
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
    const freq = parameters["frequency"][0];
    const waveform = parameters["waveform"][0];
    const fn = this.w[waveform];
    this.p.setFreq(freq);
    const output = outputs[0][0];
    for (let i = 0; i < output.length; i++) {
      output[i] = fn();
    }

    return this.r;
  }
}
