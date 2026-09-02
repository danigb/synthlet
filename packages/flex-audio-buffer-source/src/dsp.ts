import { DEFAULT_ENGINE_CONFIG } from "./engine";
import { gatherTaps, reachFor } from "./resampler";
import { createWsolaEngine } from "./wsola";

/**
 * The playback kernel: a buffer, a time-stretch engine and a pitch stage.
 *
 * Pure - no worklet globals, no imports beyond its siblings - so the main
 * thread can run the same code the processor does. That is what lets
 * `index.ts` resample a mismatched `AudioBuffer` at load time with the very
 * resampler the pitch stage uses.
 *
 * HOW PITCH AND TIME COME APART
 *
 * Resampling by β multiplies pitch by β and divides duration by β; that is the
 * varispeed `AudioBufferSourceNode` gives you, and the two cannot be separated
 * with it. Driedger & Müller §7.2 states the standard way out: resample, then
 * time-scale to put the duration back. So for a target rate `p` and pitch β,
 * the engine runs at `p / β` and the resampler then reads at β:
 *
 *     duration:  (1/(p/β)) × (1/β) = 1/p     - set by `playbackRate` alone
 *     pitch:                        × β      - set by `detune` alone
 *
 * which is the whole point of the module.
 */

export type FlexConfig = {
  sampleRate: number;
  channels: number;
  frameMs: number;
  overlap: number;
  tolerance: number;
  searchRate: number;
  /** Largest block `process` will be asked for in one go. Sizes the FIFO. */
  maxBlock: number;
};

export const DEFAULT_CONFIG = {
  ...DEFAULT_ENGINE_CONFIG,
  channels: 2,
  maxBlock: 128,
};

/** The `detune` range, in cents: the engine's ±12 semitone cap. */
export const MAX_DETUNE = 1200;
const MAX_BETA = 2; // 2 ** (1200 / 1200)

export const centsToRatio = (cents: number) => Math.pow(2, cents / 1200);

export function createFlexSource(config: FlexConfig) {
  const engine = createWsolaEngine();
  engine.configure(config);

  const channels = Math.max(1, config.channels);
  const reach = reachFor(MAX_BETA);
  // Enough engine output for one block at the fastest read, plus the kernel's
  // reach either side of it.
  const capacity = Math.ceil(config.maxBlock * MAX_BETA) + 2 * reach + 8;

  const fifo: Float32Array[] = [];
  for (let c = 0; c < channels; c++) fifo.push(new Float32Array(capacity));
  const taps = new Float32Array(2 * reach + 2);
  const pull: Float32Array[] = fifo; // engine writes straight into the FIFO

  // The engine's analysis frame N, in samples - the same rounding `wsola.ts`'s
  // `configure` does, because this is the loop seam's runway and it has to be
  // the frame the engine actually uses. See `applyRunway`.
  const frameSamples = (() => {
    const n = Math.max(
      4,
      Math.round((config.frameMs * config.sampleRate) / 1000),
    );
    return n % 2 === 0 ? n : n + 1;
  })();

  let source: Float32Array[] = [];
  // The region, in source samples, and the direction and loop flag that go
  // with it. Held here rather than recomputed at `start`: they are live
  // controls, pushed into the engine every block by `setControls`.
  let regionStart = 0;
  let regionEnd = 0;
  let reversed = false;
  let looping = false;
  // Whether the *last requested* region had anything in it. A momentarily
  // inverted region holds the previous one rather than killing the note, but a
  // `start()` into an empty one must still refuse - otherwise an offset past
  // the end of the buffer would quietly play the whole thing.
  let regionOk = false;
  let fifoStart = 0; // absolute engine index of fifo[*][0]
  let fifoFilled = 0; // valid samples from fifoStart
  let readPos = 0; // fractional absolute engine position
  let playing = false;
  let drained = false; // engine exhausted, nothing left to pull
  // Absolute engine index one past the last *real* sample. The FIFO is padded
  // with silence beyond it, so this - not the FIFO's extent - is what says
  // when playback is over.
  let producedEnd = Infinity;

  function setBuffer(buffer: Float32Array[]) {
    source = buffer;
    playing = false;
    regionStart = 0;
    regionEnd = buffer[0]?.length ?? 0;
    regionOk = regionEnd > 0;
  }

  /**
   * Push one block's worth of the four region controls into the engine.
   *
   * Seconds in, samples out. Six positional numbers rather than an object
   * literal: this runs on the audio thread every block and must not allocate.
   *
   * Separate from `process` because these are *state the engine holds*, while
   * `playbackRate` and `detune` are consumed inside the render loop.
   */
  function setControls(
    startOffset: number,
    endOffset: number,
    reverse: number,
    loop: number,
  ) {
    reversed = reverse > 0;
    looping = loop > 0;
    engine.setDirection(reversed ? -1 : 1);
    engine.setLoop(looping);

    const length = source[0]?.length ?? 0;
    if (length === 0) {
      regionOk = false;
      return;
    }
    const seconds = config.sampleRate;
    const from = Math.max(
      0,
      Math.min(length, Math.round(startOffset * seconds)),
    );
    // 0 means "the end of the buffer" - the sentinel `duration` used to carry.
    const to =
      endOffset > 0
        ? Math.max(0, Math.min(length, Math.round(endOffset * seconds)))
        : length;

    // An inverted region is held, not applied: a modulated region that
    // momentarily crosses itself must not kill the note.
    regionOk = to > from;
    if (!regionOk) return;

    regionStart = from;
    regionEnd = to;
    applyRunway(length);
    engine.setRegion(regionStart, regionEnd);
  }

  /**
   * A seamless loop seam needs one analysis frame of source past the loop point
   * to crossfade with - measured, not assumed: half a frame still clicks. So
   * looping clamps the far edge of the region inwards by a frame, on whichever
   * side the playhead crosses.
   *
   * Only the "loop the whole buffer right to its last sample" case is clamped,
   * and it loses up to `frameMs`. In the normal case - a loop inside a longer
   * sample - nothing moves and the loop length is exact.
   */
  function applyRunway(length: number) {
    if (!looping) return;
    if (reversed) {
      // Backwards, the runway lies *before* the region start.
      const from = Math.max(regionStart, frameSamples);
      if (from < regionEnd) regionStart = from;
    } else {
      const to = Math.min(regionEnd, length - frameSamples);
      if (to > regionStart) regionEnd = to;
    }
  }

  function start() {
    if (source.length === 0 || !regionOk) return false;
    if (regionEnd <= regionStart) return false;

    engine.setDirection(reversed ? -1 : 1);
    engine.setLoop(looping);
    engine.reset(source, regionStart, regionEnd);
    fifoStart = 0;
    fifoFilled = 0;
    readPos = 0;
    drained = false;
    producedEnd = Infinity;
    playing = true;
    for (const channel of fifo) channel.fill(0);
    return true;
  }

  function stop() {
    playing = false;
  }

  /** Slide the FIFO so it begins at `newStart`, then top it up from the engine. */
  function refill(newStart: number, needEnd: number) {
    if (newStart > fifoStart) {
      const drop = Math.min(newStart - fifoStart, fifoFilled);
      const keep = fifoFilled - drop;
      for (const channel of fifo) channel.copyWithin(0, drop, drop + keep);
      fifoStart += drop;
      fifoFilled = keep;
    }
    // A gap would mean the read position ran backwards, which it never does.
    const wanted = Math.min(capacity, needEnd - fifoStart);
    while (fifoFilled < wanted && !drained) {
      const chunk = Math.min(wanted - fifoFilled, capacity - fifoFilled);
      if (chunk <= 0) break;
      const written = engine.process(pull, fifoFilled, chunk);
      if (written < chunk) {
        producedEnd = fifoStart + fifoFilled + written;
        drained = true;
      }
      fifoFilled += chunk;
      if (engine.done() && !drained) {
        producedEnd = fifoStart + fifoFilled;
        drained = true;
      }
    }
    if (fifoFilled < wanted) {
      // Past the end of the source: the engine writes silence, so does this.
      for (const channel of fifo) channel.fill(0, fifoFilled, wanted);
      fifoFilled = wanted;
    }
  }

  /**
   * Fill `count` frames from `offset`. Returns true once playback has
   * finished, in which case the tail of the block is silence.
   *
   * The offset is why this takes one rather than a `subarray` view: a view is
   * an allocation, and this runs on the audio thread.
   */
  function process(
    outputs: Float32Array[],
    offset: number,
    count: number,
    playbackRate: number,
    detune: number,
  ) {
    if (!playing) {
      for (const channel of outputs) channel.fill(0, offset, offset + count);
      return false;
    }

    const beta = centsToRatio(
      Math.max(-MAX_DETUNE, Math.min(MAX_DETUNE, detune)),
    );
    engine.setRate(playbackRate / beta);

    let done = false;
    let at = 0;
    while (at < count) {
      const chunk = Math.min(count - at, config.maxBlock);
      const span = chunk * beta;
      const localReach = reachFor(beta);
      refill(
        Math.floor(readPos) - localReach,
        Math.ceil(readPos + span) + localReach + 1,
      );

      for (let j = 0; j < chunk; j++) {
        const position = readPos + j * beta;
        // Exact passthrough: at unity ratio and an *integer* position the
        // kernel is a unit impulse, so skip it entirely rather than spend 33
        // taps proving it. The position is only integral if `detune` has been
        // 0 for the whole playback - automating it back to zero after any
        // other value leaves `readPos` fractional, and those samples fall
        // through to the sinc path below, where beta = 1 is a constant
        // fractional delay.
        if (beta === 1 && Number.isInteger(position)) {
          const index = position - fifoStart;
          for (let c = 0; c < outputs.length; c++) {
            outputs[c][offset + at + j] =
              fifo[Math.min(c, channels - 1)][index];
          }
          continue;
        }
        const { first, count: taken } = gatherTaps(position, beta, taps);
        // A tap only counts towards the weight if it lands on a real sample.
        // Dropping out-of-range taps from the sum but not the weight is what
        // would fade the first and last few samples of a clip.
        const lowest = Math.max(first, 0, fifoStart);
        const highest = Math.min(first + taken, fifoStart + fifoFilled);
        let weight = 0;
        for (let n = lowest; n < highest; n++) weight += taps[n - first];
        if (weight <= 1e-9) {
          for (let c = 0; c < outputs.length; c++)
            outputs[c][offset + at + j] = 0;
          continue;
        }
        for (let c = 0; c < outputs.length; c++) {
          const channel = fifo[Math.min(c, channels - 1)];
          let sum = 0;
          for (let n = lowest; n < highest; n++) {
            sum += taps[n - first] * channel[n - fifoStart];
          }
          outputs[c][offset + at + j] = sum / weight;
        }
      }

      readPos += span;
      at += chunk;
      if (readPos >= producedEnd) done = true;
    }

    if (done) playing = false;
    return done;
  }

  return {
    setBuffer,
    setControls,
    start,
    stop,
    process,
    isPlaying: () => playing,
  };
}
