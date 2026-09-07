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
    const out = outputs[0][0];
    const trigger = parameters.trigger;
    out.fill(0);

    // The single sample goes at index 0 on purpose: the spec says a k-rate
    // param is sampled at the very first sample-frame of each render quantum,
    // so an impulse written anywhere else would be invisible to a k-rate
    // consumer. Every consumer *in this library* can now see it wherever it
    // lands, but a user may still have connected this to a native `AudioParam`
    // they left k-rate, so moving it is a deliberate change of its own.
    //
    // What is no longer quantised is the *detection*. The detector consumes
    // every sample it was given, so a pulse narrower than a render quantum
    // fires instead of vanishing, and a trigger arriving at sample 100 fires in
    // that block. Two rising edges inside one block still yield one impulse:
    // index 0 holds one, and that is the same deferred question.
    if (trigger.length > 1) {
      for (let i = 0; i < trigger.length; i++) {
        if (this.g(trigger[i]) === true) out[0] = 1;
      }
    } else if (this.g(trigger[0]) === true) {
      out[0] = 1;
    }

    return this.r;
  }

  static get parameterDescriptors() {
    return PARAMS;
  }
}

registerProcessor("ImpulseProcessor", ImpulseProcessor);
