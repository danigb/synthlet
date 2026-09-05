import { createAnalogDelay, DEFAULT_MAX_TIME } from "./dsp";
import { PARAMS } from "./params";

// A delay has to keep running after its input stops or it cuts off its own
// tail, so - unlike every other effect in the catalogue - this processor never
// early-returns on a missing input. It feeds silence instead. The render
// quantum is 128 and does not change, so this is allocated once; it grows only
// if a test drives the processor with a longer block.
let silence = new Float32Array(128);

export class AnalogDelayProcessor extends AudioWorkletProcessor {
  r: boolean; // running
  u: ReturnType<typeof createAnalogDelay>["update"];
  g: ReturnType<typeof createAnalogDelay>["compute"];

  constructor(options?: AudioWorkletNodeOptions) {
    super();
    this.r = true;
    const { compute, update } = createAnalogDelay(
      sampleRate,
      options?.processorOptions?.maxTime ?? DEFAULT_MAX_TIME,
    );
    this.u = update;
    this.g = compute;
    this.port.onmessage = (event) => {
      switch (event.data.type) {
        case "DISPOSE":
          this.r = false;
          break;
      }
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], params: any) {
    this.u(
      params.time[0],
      params.feedback[0],
      params.mix[0],
      params.taps[0],
      params.age[0],
      params.wobble[0],
      params.spread[0],
      params.mode[0],
    );

    const outL = outputs[0][0];
    const outR = outputs[0][1];
    const input = inputs[0];
    if (silence.length < outL.length) silence = new Float32Array(outL.length);
    // Mono in feeds both lines; anything wider uses its first two channels.
    const inL = input.length > 0 ? input[0] : silence.subarray(0, outL.length);
    const inR = input.length > 1 ? input[1] : inL;

    this.g(inL, inR, outL, outR);
    return this.r;
  }

  static get parameterDescriptors() {
    return PARAMS;
  }
}

registerProcessor("AnalogDelayProcessor", AnalogDelayProcessor);
