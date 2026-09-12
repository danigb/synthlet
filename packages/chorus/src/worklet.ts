import { createChorus } from "./dsp";
import { PARAMS } from "./params";

// A chorus holds up to 20 ms of the signal, so it has a short tail like a
// delay does: early-returning on a missing input freezes that tail in the line
// instead of flushing it, and whatever reconnects next hears it. Silence is
// fed instead, the way `analog-delay` does. The render quantum is 128 and does
// not change, so this is allocated once; it grows only if a test drives the
// processor with a longer block.
let silence = new Float32Array(128);

export class ChorusProcessor extends AudioWorkletProcessor {
  r: boolean; // running
  u: ReturnType<typeof createChorus>["update"];
  g: ReturnType<typeof createChorus>["compute"];

  constructor() {
    super();
    this.r = true;
    const { compute, update } = createChorus(sampleRate);
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
      params.mode[0],
      params.rate[0],
      params.depth[0],
      params.mix[0],
      params.width[0],
    );

    const outL = outputs[0][0];
    const outR = outputs[0][1];
    if (silence.length < outL.length) silence = new Float32Array(outL.length);

    // Mono in feeds both lines - stereo out from a mono source is the point of
    // the effect - and anything wider uses its first two channels. The engine
    // this replaces read `inputs[0][0]` and nothing else, so a stereo source
    // was silently halved.
    const input = inputs[0];
    const inL = input.length > 0 ? input[0] : silence.subarray(0, outL.length);
    const inR = input.length > 1 ? input[1] : inL;

    this.g(inL, inR, outL, outR);
    return this.r;
  }

  static get parameterDescriptors() {
    return PARAMS;
  }
}

registerProcessor("ChorusProcessor", ChorusProcessor);
