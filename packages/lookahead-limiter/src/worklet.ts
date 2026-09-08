import { blocksPerPost, createLevelsWriter } from "./_levels";
import {
  createLimiter,
  DEFAULT_LOOKAHEAD_MS,
  GAIN_REDUCTION,
  LEVELS_LAYOUT_VERSION,
  LEVELS_LENGTH,
} from "./dsp";
import { PARAMS } from "./params";

const RENDER_QUANTUM = 128;
const DEFAULT_POST_INTERVAL_MS = 16;

export class LookaheadLimiterProcessor extends AudioWorkletProcessor {
  p: ReturnType<typeof createLimiter>; // processor
  r: boolean = true; // running
  v?: Float32Array; // levels view
  w?: ReturnType<typeof createLevelsWriter>; // levels writer
  g?: Float32Array; // the gain the limiter applied, per sample

  constructor(options?: any) {
    super();
    const o = options?.processorOptions ?? {};
    const lookahead = o.lookahead ?? DEFAULT_LOOKAHEAD_MS;
    this.p = createLimiter(sampleRate, lookahead);

    // Opt in, like `truePeak` and `loudness` next door, and for the same
    // reason: a limiter sits at the end of every master chain and most of them
    // have nothing attached to read this. A processor posting at 60 Hz to
    // nobody is waste, and the option is one word.
    if (o.meter) {
      this.v = o.levelsBuffer
        ? new Float32Array(o.levelsBuffer)
        : new Float32Array(LEVELS_LENGTH);
      this.v[0] = LEVELS_LAYOUT_VERSION;
      this.v[1] = 1; // one slot
      this.w = createLevelsWriter({
        port: this.port,
        view: this.v,
        blocksPerPost: blocksPerPost(
          !!o.levelsBuffer,
          o.postIntervalMs ?? DEFAULT_POST_INTERVAL_MS,
          RENDER_QUANTUM,
          sampleRate,
        ),
      });
      // The gain is already computed per sample; `gainOut` is the DSP's own
      // existing way of handing it back, so metering reads the number rather
      // than recomputing it.
      this.g = new Float32Array(RENDER_QUANTUM);
    }

    this.port.onmessage = (event) => {
      switch (event.data.type) {
        case "DISPOSE":
          this.r = false;
          break;
      }
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], params: any) {
    const length = outputs[0]?.[0]?.length ?? 0;
    // Only allocated when metering, and only grown if a host ever renders a
    // quantum bigger than 128.
    if (this.g && this.g.length < length) this.g = new Float32Array(length);

    this.p(
      inputs[0],
      outputs[0],
      params.threshold,
      params.release[0],
      params.gain,
      this.g,
    );

    if (this.w && this.g && length > 0) {
      let min = 1;
      for (let i = 0; i < length; i++) if (this.g[i] < min) min = this.g[i];
      this.v![GAIN_REDUCTION] = 20 * Math.log10(min);
      this.w.flush();
    }

    return this.r;
  }

  static get parameterDescriptors() {
    return PARAMS;
  }
}

registerProcessor("LookaheadLimiterProcessor", LookaheadLimiterProcessor);
