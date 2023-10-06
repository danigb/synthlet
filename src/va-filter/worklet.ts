import { toWorkletParams } from "../worklet-utils";
import { VaFilter, VaFilterParams } from "./va-filter";

const PARAM_DESCRIPTORS = toWorkletParams(VaFilterParams);

/**
 * Single input-output filter with selectable algorithms
 */
export class VaFilterWorklet extends AudioWorkletProcessor {
  processor: VaFilter;

  constructor() {
    super();
    this.processor = new VaFilter(sampleRate);
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: any
  ) {
    const filterType = parameters.type[0];
    const frequency = parameters.frequency[0];
    const resonance = parameters.resonance[0];
    this.processor.setParams(filterType, frequency, resonance);
    const input = inputs[0][0];
    const output = outputs[0][0];
    if (!input || !output) return true;

    for (let i = 0; i < output.length; i++) {
      output[i] = this.processor.process(input[i]);
    }

    return true;
  }

  static get parameterDescriptors() {
    return PARAM_DESCRIPTORS;
  }
}

registerProcessor("VaFilterWorklet", VaFilterWorklet);