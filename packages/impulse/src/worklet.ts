import { createGateDetector } from "./_gate";
import { PARAMS } from "./params";

export class ImpulseProcessor extends AudioWorkletProcessor {
  r: boolean; // running
  g: ReturnType<typeof createGateDetector>; // gate detector

  constructor() {
    super();
    this.r = true;
    this.g = createGateDetector();
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
    outputs[0][0].fill(0);

    // The single sample goes at index 0 on purpose: the spec says a k-rate
    // param is sampled at the very first sample-frame of each render quantum,
    // so an impulse written anywhere else would be invisible to every k-rate
    // consumer in the library.
    if (this.g(parameters.trigger[0]) === true) outputs[0][0][0] = 1;

    return this.r;
  }

  static get parameterDescriptors() {
    return PARAMS;
  }
}

registerProcessor("ImpulseProcessor", ImpulseProcessor);
