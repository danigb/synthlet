import { toWorkletParams } from "../worklet-utils";
import { PARAMS, Sequencer } from "./sequencer";

const PARAM_DESCRIPTORS = toWorkletParams(PARAMS);

export class SequencerWorklet extends AudioWorkletProcessor {
  p: Sequencer; // processor
  d: boolean; // disconnected

  constructor() {
    super();
    this.d = false;
    this.p = Sequencer(sampleRate);
    this.port.onmessage = (event) => {
      switch (event.data.type) {
        case "SET_SEQUENCE":
          this.p.setSequence(event.data.sequence);
          return;

        case "DISCONNECT":
          this.d = true;
          return;
      }
    };
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: any
  ) {
    if (this.d) return false;

    this.p.setParams(parameters);
    this.p.fillControl(outputs[0][0]);
    return true;
  }

  static get parameterDescriptors() {
    return PARAM_DESCRIPTORS;
  }
}

registerProcessor("SequencerWorklet", SequencerWorklet);
