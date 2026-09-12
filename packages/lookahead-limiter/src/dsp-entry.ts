/**
 * `@synthlet/lookahead-limiter/dsp` - the limiter's DSP without the worklet.
 *
 * A deliberately curated surface rather than everything `dsp.ts` happens to
 * export: `createSlidingMin` stays internal, and `createTruePeakDetector` is
 * published because `@synthlet/level-meter` measures dBTP with it. One
 * implementation is the whole point - two detectors disagreeing by 0.2 dB is a
 * worse outcome than 48 multiply-accumulates.
 */
export {
  createLimiter,
  createTruePeakDetector,
  latencySamples,
  lookaheadSamples,
  DEFAULT_LOOKAHEAD_MS,
  MAX_LOOKAHEAD_MS,
  MIN_LOOKAHEAD_MS,
  TP_DELAY,
} from "./dsp";
