/**
 * The time-stretch engine contract.
 *
 * One algorithm implements it today (`wsola.ts`). It exists as an interface so
 * a second one - ESOLA, a phase vocoder, or a WASM-backed port - can be
 * selected by `processorOptions.algorithm` without touching the playback state
 * machine in `dsp.ts`.
 *
 * The engine is pure time-scaling: it knows nothing about pitch. Pitch is a
 * resampler wrapped around it, composed in `dsp.ts`, because that composition
 * is the same whatever the engine is.
 *
 * Allocation contract: `configure` is the only method allowed to allocate.
 * Everything else runs on buffers it made.
 */

export type EngineConfig = {
  sampleRate: number;
  /** Channels the engine will be asked to process. Sizes the accumulators. */
  channels: number;
  /** Analysis frame length in milliseconds. */
  frameMs: number;
  /** Fraction of a frame that overlaps its successor, in [0, 1). */
  overlap: number;
  /** Similarity search radius, as a fraction of the frame length. */
  tolerance: number;
  /** Rate the similarity search runs at, in Hz. Lower is cheaper. */
  searchRate: number;
};

/** The configuration tier, as shipped. Not AudioParams - these size buffers. */
export const DEFAULT_ENGINE_CONFIG = {
  frameMs: 30,
  overlap: 0.5,
  tolerance: 0.25,
  searchRate: 12000,
};

export type TimeStretchEngine = {
  /** Size every buffer. The only method that allocates. */
  configure(config: EngineConfig): void;

  /**
   * Set the time-stretch ratio, where 1 is unmodified and 0.5 is half speed.
   *
   * Takes effect from the next analysis frame, not the next sample: the engine
   * consumes rate as a per-block step. A ramp is a sequence of small steps.
   */
  setRate(rate: number): void;

  /** Point the engine at a region of a buffer and rewind. Does not allocate. */
  reset(source: Float32Array[], start: number, end: number): void;

  /**
   * Write `count` frames into `outputs` starting at `offset`.
   *
   * Returns how many of those frames are part of the playback; a short return
   * means the source ran out mid-block and the rest of the block is silence.
   */
  process(outputs: Float32Array[], offset: number, count: number): number;

  /** True once the source is exhausted and everything pending has been read. */
  done(): boolean;
};
