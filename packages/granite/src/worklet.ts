import {
  createGranulator,
  DEFAULT_BUFFER_SECONDS,
  DEFAULT_MAX_GRAINS,
} from "./dsp";
import { PARAMS } from "./params";

// Like `digital-delay`, and unlike every other effect in the catalogue, this
// processor never early-returns on a missing input: the buffer still holds
// several seconds of audio and grains already in flight have to play through.
// It feeds silence instead. The render quantum is 128 and does not change, so
// this is allocated once; it grows only if a test drives a longer block.
let silence = new Float32Array(128);

export class GraniteProcessor extends AudioWorkletProcessor {
  r: boolean; // running
  u: ReturnType<typeof createGranulator>["update"];
  g: ReturnType<typeof createGranulator>["process"];

  constructor(options?: AudioWorkletNodeOptions) {
    super();
    this.r = true;
    const { update, process } = createGranulator(sampleRate, {
      maxGrains: options?.processorOptions?.maxGrains ?? DEFAULT_MAX_GRAINS,
      bufferSeconds:
        options?.processorOptions?.bufferSeconds ?? DEFAULT_BUFFER_SECONDS,
    });
    this.u = update;
    this.g = process;
    this.port.onmessage = (event) => {
      switch (event.data.type) {
        case "DISPOSE":
          this.r = false;
          break;
      }
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], params: any) {
    // Every parameter is k-rate, so this is six reads per block and the grains
    // born inside it all see the same control values - which is also what makes
    // them identical until ticket 03 gives each one its own draw.
    this.u(
      params.rate[0],
      params.duration[0],
      params.position[0],
      params.pitch[0],
      params.shape[0],
      params.wet[0],
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

registerProcessor("GraniteProcessor", GraniteProcessor);
