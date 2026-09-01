import { gatePulse } from "./_gate";
import { PARAMS } from "./params";

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
    parameters: any,
  ) {
    if (parameters.bpm[0] !== this.bpm) {
      this.bpm = parameters.bpm[0];
      this.i = this.bpm / 60 / sampleRate;
    }
    let nextPhase = this.p + outputs[0][0].length * this.i;
    if (nextPhase > 1) nextPhase -= 1;

    let fill = nextPhase < this.p ? 1 : this.p;

    // Output 0 is the phase ramp, unchanged: Euclid multiplies it to subdivide
    // the clock, which a square gate cannot support. Output 1 is the gate,
    // which is what an envelope wants - a phase is not a gate, and no
    // threshold makes it one (any threshold fires early; `> 0` latches on).
    outputs[0][0].fill(fill);

    // Taken from the phase *after* the wrap, so the gate's rising edge lands
    // on the same block as the phase output's 1.0 plateau - the block the AD
    // has always fired on. A stopped clock emits no gate rather than holding
    // it open at phase 0 forever.
    if (outputs[1]?.[0]) {
      outputs[1][0].fill(
        this.i > 0 ? gatePulse(nextPhase, parameters.pulseWidth[0]) : 0,
      );
    }

    this.p = nextPhase;

    return this.r;
  }

  static get parameterDescriptors() {
    return PARAMS;
  }
}

registerProcessor("ClockWorkletProcessor", ClockWorkletProcessor);
