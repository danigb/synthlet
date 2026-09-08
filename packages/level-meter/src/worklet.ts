import {
  ANALYSIS_FRAME,
  createLevelAnalyzer,
  DEFAULT_MAX_CHANNELS,
  levelsLength,
  type LevelAnalyzer,
} from "./dsp";

// The whole of the meter's arithmetic lives in `./dsp`. What is left here is
// what only a worklet can do: copy the input to the output, hand the analyzer a
// render quantum, publish the readings, and answer port messages. The processor
// no longer knows what a decibel is.

const DEFAULT_POST_INTERVAL_MS = 16;

export class LevelMeterProcessor extends AudioWorkletProcessor {
  a: LevelAnalyzer; // the pure core
  v: Float32Array; // the level buffer: shared, or posted every `pe` blocks
  pe: number; // blocks between posts, or 0 when the buffer is shared
  pc: number; // blocks since the last post
  r: boolean;

  constructor(options: AudioWorkletNodeOptions) {
    super();
    this.r = true;
    const o = options.processorOptions ?? {};
    const maxChannels = o.maxChannels ?? DEFAULT_MAX_CHANNELS;

    // Shared when the main thread could allocate a SharedArrayBuffer; otherwise
    // the processor owns the buffer and posts a copy of it. Nothing below knows
    // which one it is writing to.
    this.v = new Float32Array(o.levelsBuffer ?? levelsLength(maxChannels));

    // `sampleRate` is a worklet global and the one thing the core cannot read
    // for itself, so it is passed in - which is exactly what lets the same core
    // run offline at any rate.
    this.a = createLevelAnalyzer(sampleRate, {
      maxChannels,
      releaseDbPerSecond: o.releaseDbPerSecond,
      holdMs: o.holdMs,
      clipHoldMs: o.clipHoldMs,
      clipThreshold: o.clipThreshold,
      rmsMs: o.rmsMs,
      truePeak: o.truePeak,
      loudness: o.loudness,
      channelWeights: o.channelWeights,
      // A live meter has no programme until the caller declares one, so the
      // gated histograms start empty and stay empty until START_INTEGRATION.
      // Offline is the other answer: there the buffer *is* the programme.
      integrate: false,
    });

    // Posted from a block counter rather than a timer: the audio thread has no
    // clock of its own worth trusting, and a counter cannot drift against the
    // render graph. ~16 ms is ~60 Hz, which is one frame's worth of ~20 floats.
    const blockSeconds = ANALYSIS_FRAME / sampleRate;
    const postInterval = o.postIntervalMs ?? DEFAULT_POST_INTERVAL_MS;
    this.pe = o.levelsBuffer
      ? 0
      : Math.max(1, Math.round(postInterval / 1000 / blockSeconds));
    this.pc = 0;

    this.port.onmessage = (event) => {
      switch (event.data.type) {
        case "DISPOSE":
          this.r = false;
          break;
        case "CLEAR_CLIP":
          this.a.clearClip();
          // The core clears its latch; this is so a reader looking before the
          // next block lands sees the click it just made.
          this.v[2] = 0;
          break;
        // EBU Tech 3341 §2.2: an 'EBU Mode' meter must let the user start,
        // pause and continue the Integrated and Loudness Range measurement,
        // and reset it from either state. §2.4: the two always reset together,
        // which the core does for itself.
        case "START_INTEGRATION":
          this.a.loudness?.startIntegration();
          break;
        case "STOP_INTEGRATION":
          this.a.loudness?.stopIntegration();
          break;
        case "RESET_INTEGRATION":
          this.a.loudness?.resetIntegration();
          break;
      }
    };
  }

  // The node is a tap: `numberOfOutputs: 0`, so `outputs` is empty and there is
  // nothing to write. Pass-through is a native `GainNode` with one of these
  // beside it, which is what deleted the `chOut.set(chIn)` memcpy of every
  // sample - metering reads those samples anyway - and with it the last way a
  // thrown processor could silence the audio it was watching.
  process(
    inputs: Float32Array[][],
    _outputs: Float32Array[][],
    _parameters: Record<string, Float32Array>,
  ): boolean {
    const input = inputs[0];

    // The length is passed explicitly so an unconnected input - which arrives
    // as an empty `inputs[0]` - still advances time and keeps the reading
    // falling instead of freezing it.
    const length = input[0]?.length ?? ANALYSIS_FRAME;
    this.a.process(input, 0, length);
    this.a.results(this.v);

    // The payload is the buffer itself - one pre-shaped array, not an object
    // literal - so the structured clone is a single small copy.
    if (this.pe !== 0 && ++this.pc >= this.pe) {
      this.pc = 0;
      this.port.postMessage(this.v);
    }

    return this.r;
  }

  static get parameterDescriptors() {
    return [];
  }
}

registerProcessor("LevelMeterProcessor", LevelMeterProcessor);
