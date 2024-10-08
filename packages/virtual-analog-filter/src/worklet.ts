import { Diode } from "./diode";
import { Korg35 } from "./korg35";
import { Moog } from "./moog";
import { MoogHalf } from "./moog-half";
import { Oberheim } from "./oberheim";

type Filter = {
  update: (frequency: number, resonance: number) => void;
  process: (input: Float32Array, output: Float32Array) => void;
};

export class VAF extends AudioWorkletProcessor {
  r: boolean; // running
  t: number; // type
  p: Filter[];
  d: Filter;

  constructor() {
    super();
    this.r = true;
    this.p = [
      Moog(sampleRate),
      MoogHalf(sampleRate),
      Korg35(sampleRate, 0),
      Korg35(sampleRate, 1),
      Diode(sampleRate),
      Oberheim(sampleRate, 0),
      Oberheim(sampleRate, 1),
      Oberheim(sampleRate, 2),
      Oberheim(sampleRate, 3),
    ];
    this.t = 0;
    this.d = this.p[0];
    this.port.onmessage = (event) => {
      switch (event.data.type) {
        case "DISPOSE":
          this.r = false;
          break;
      }
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], params: any) {
    const t = Math.floor(params.type);
    if (this.t !== t) {
      this.t = t;
      this.d = this.p[t] || this.p[0];
      console.log("USING FILTER", t, this.d);
    }

    if (inputs[0].length === 0) return this.r;
    const detune = params.detune[0];
    const freq = params.frequency[0];
    this.d.update(
      freq * (detune ? Math.pow(2, params.detune[0] / 12) : 1),
      params.resonance[0]
    );
    this.d.process(inputs[0][0], outputs[0][0]);
    return this.r;
  }

  static get parameterDescriptors() {
    return [
      ["type", 0, 0, 8],
      ["frequency", 1000, 20, 20000],
      ["detune", 0, -127, 127],
      ["resonance", 0.8, 0, 1],
    ].map(([name, defaultValue, minValue, maxValue]) => ({
      name,
      defaultValue,
      minValue,
      maxValue,
      automationRate: "k-rate",
    }));
  }
}

registerProcessor("VAFProcessor", VAF);
