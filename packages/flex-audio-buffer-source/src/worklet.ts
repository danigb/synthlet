import { createFlexSource, DEFAULT_CONFIG, type FlexConfig } from "./dsp";
import { PARAMS } from "./params";

/**
 * The playback state machine.
 *
 * Scheduling is resolved against `currentFrame` - the frame index of the first
 * sample of the block being rendered - so `start(when)` lands on the sample it
 * asked for rather than on the next 128-frame boundary. Nothing else in the
 * library needs `currentFrame`; a source that can be scheduled does.
 *
 * `start()` is restartable, which is a deliberate divergence from
 * `AudioBufferSourceNode`. There, a node is spent after one play and a second
 * `start()` throws; here a finished or stopped source can be started again and
 * rewinds. The Web Audio rule exists to let an implementation free a node
 * eagerly, and it is the part of that API people most often work around. The
 * guard that remains is against starting a source that is *already playing* -
 * that is a mistake, not a rewind, and `index.ts` throws on it.
 */
export class FlexAudioBufferSourceProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return PARAMS;
  }

  private flex: ReturnType<typeof createFlexSource> | null = null;
  private config: FlexConfig;
  private running = true;
  private startFrame: number | null = null;
  private stopFrame: number | null = null;
  private pendingOffset = 0;
  private pendingDuration = 0;

  constructor(options?: AudioWorkletNodeOptions) {
    super();
    const given = (options?.processorOptions ?? {}) as Partial<FlexConfig>;
    this.config = {
      sampleRate,
      channels: DEFAULT_CONFIG.channels,
      frameMs: given.frameMs ?? DEFAULT_CONFIG.frameMs,
      overlap: given.overlap ?? DEFAULT_CONFIG.overlap,
      tolerance: given.tolerance ?? DEFAULT_CONFIG.tolerance,
      searchRate: given.searchRate ?? DEFAULT_CONFIG.searchRate,
      maxBlock: DEFAULT_CONFIG.maxBlock,
    };

    this.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case "SET_BUFFER":
          this.setBuffer(data.channels);
          break;
        case "START":
          // `when` is context time in seconds; 0 or less means "now".
          this.startFrame = Math.max(
            0,
            Math.round((data.when ?? 0) * sampleRate),
          );
          this.pendingOffset = Math.round((data.offset ?? 0) * sampleRate);
          this.pendingDuration = Math.round((data.duration ?? 0) * sampleRate);
          this.stopFrame = null;
          break;
        case "STOP":
          this.stopFrame = Math.max(
            0,
            Math.round((data.when ?? 0) * sampleRate),
          );
          break;
        case "DISPOSE":
          this.running = false;
          break;
      }
    };
  }

  /** Rebuilding on a new buffer is where this module is allowed to allocate. */
  private setBuffer(channels: Float32Array[]) {
    if (!channels?.length) {
      this.flex = null;
      return;
    }
    this.config = { ...this.config, channels: channels.length };
    this.flex = createFlexSource(this.config);
    this.flex.setBuffer(channels);
    this.startFrame = null;
    this.stopFrame = null;
  }

  process(
    _inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ) {
    const output = outputs[0];
    const count = output[0]?.length ?? 0;
    if (!this.flex || count === 0) {
      for (const channel of output) channel.fill(0);
      return this.running;
    }

    // Both params are k-rate, and honestly so - the engine consumes a rate
    // change as a per-block step - so one read each per block is the whole
    // story. An a-rate caller gets the value at the block boundary.
    const playbackRate = parameters.playbackRate[0];
    const cents = parameters.detune[0];

    // Where in this block the scheduled edges fall, if they fall in it at all.
    const startAt = this.edgeInBlock(this.startFrame, count);
    const stopAt = this.edgeInBlock(this.stopFrame, count);

    let at = 0;
    let ended = false;

    if (startAt !== null) {
      for (const channel of output) channel.fill(0, 0, startAt);
      this.flex.start(this.pendingOffset, this.pendingDuration);
      this.startFrame = null;
      at = startAt;
    }

    const until = stopAt !== null ? stopAt : count;
    if (until > at) {
      ended = this.renderInto(output, at, until - at, playbackRate, cents);
    }
    if (stopAt !== null) {
      const wasPlaying = this.flex.isPlaying();
      this.flex.stop();
      this.stopFrame = null;
      for (const channel of output) channel.fill(0, stopAt, count);
      if (wasPlaying) ended = true;
    }

    if (ended) this.port.postMessage({ type: "ENDED" });
    return this.running;
  }

  /** The offset within this block at which `frame` falls, or null. */
  private edgeInBlock(frame: number | null, count: number) {
    if (frame === null) return null;
    if (frame >= currentFrame + count) return null;
    return Math.max(0, frame - currentFrame);
  }

  private renderInto(
    output: Float32Array[],
    at: number,
    count: number,
    playbackRate: number,
    cents: number,
  ) {
    return this.flex!.process(output, at, count, playbackRate, cents);
  }
}

registerProcessor(
  "FlexAudioBufferSourceProcessor",
  FlexAudioBufferSourceProcessor,
);
