import { toWorkletParams } from "../worklet-utils";
import { Filter, FilterParams } from "./filter";

/**
 * Single input-output filter with selectable algorithms
 */
export class FilterWorklet extends AudioWorkletProcessor {
  impulse: Filter;
  static PARAMS = toWorkletParams(FilterParams);

  constructor() {
    super();
    this.impulse = new Filter(sampleRate);
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: any
  ) {
    const filterType = parameters.filterType[0];
    const frequency = parameters.frequency[0];
    const resonance = parameters.resonance[0];
    this.impulse.setParams(filterType, frequency, resonance);
    const input = inputs[0][0];
    const output = outputs[0][0];
    for (let i = 0; i < output.length; i++) {
      output[i] = this.impulse.process(input[i]);
    }

    return true;
  }

  static get parameterDescriptors() {
    return FilterWorklet.PARAMS;
  }
}

registerProcessor("FilterWorklet", FilterWorklet);
