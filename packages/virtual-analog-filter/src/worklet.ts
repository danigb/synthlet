import { Diode } from "./diode";
import { Korg35 } from "./korg35";
import { Moog } from "./moog";
import { MoogHalf } from "./moog-half";
import { Oberheim } from "./oberheim";
import { PARAMS } from "./params";

type Filter = {
  update: (frequency: number, resonance: number) => void;
  process: (input: Float32Array, output: Float32Array) => void;
};

export class VAF extends AudioWorkletProcessor {
  r: boolean; // running
  p: Filter[][]; // one bank of filters per channel

  constructor() {
    super();
    this.r = true;
    this.p = [];
    this.port.onmessage = (event) => {
      switch (event.data.type) {
        case "DISPOSE":
          this.r = false;
          break;
      }
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], params: any) {
    const input = inputs[0];
    const output = outputs[0];
    if (input.length === 0) return this.r;

    const type = Math.floor(params.type);
    const detune = params.detune[0];
    const frequency =
      params.frequency[0] * (detune ? Math.pow(2, detune / 12) : 1);
    const resonance = params.resonance[0];

    for (let c = 0; c < input.length && c < output.length; c++) {
      // A ladder filter is all state, so every channel filters through its
      // own bank: one shared instance would smear the channels together.
      const bank = (this.p[c] ??= createFilters(sampleRate));
      const filter = bank[type] || bank[0];
      filter.update(frequency, resonance);
      filter.process(input[c], output[c]);
    }

    return this.r;
  }

  static get parameterDescriptors() {
    return PARAMS;
  }
}

registerProcessor("VAFProcessor", VAF);

// One instance of every filter type, built on the first block that has this
// many channels. Keeping all of them means switching `type` mid-note picks up
// that filter's own state, the way it did when there was a single bank.
function createFilters(sampleRate: number): Filter[] {
  return [
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
}
