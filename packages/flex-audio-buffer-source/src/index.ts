import { DEFAULT_CONFIG } from "./dsp";
import { PARAMS } from "./params";
import { PROCESSOR } from "./processor";
import { resampleBuffer } from "./resampler";
import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";

export const registerFlexAudioBufferSourceWorklet = createRegistrar(
  "FABS",
  PROCESSOR,
);

/** Raw channel data, for callers who never built an `AudioBuffer`. */
export type RawBuffer = {
  channels: Float32Array[];
  sampleRate: number;
};

export type FlexAudioBufferSourceInputs = {
  playbackRate?: ParamInput;
  detune?: ParamInput;
  /**
   * Output channel count (default 2). Not an AudioParam: it sizes the output
   * bus, which Web Audio fixes at construction. A mono buffer fans out to
   * every channel; a stereo one stays panned.
   */
  channelCount?: number;
  /** Analysis frame length in ms (default 30). Configuration, not performance. */
  frameMs?: number;
  /** Frame overlap fraction (default 0.5). */
  overlap?: number;
  /** Similarity search radius as a fraction of the frame (default 0.25). */
  tolerance?: number;
  /** Rate the similarity search runs at, in Hz (default 12000). */
  searchRate?: number;
};

export type FlexAudioBufferSourceWorkletNode = AudioWorkletNode & {
  playbackRate: AudioParam;
  detune: AudioParam;

  /** Load a buffer. Resamples once, here, if its rate is not the context's. */
  setBuffer(buffer: AudioBuffer | RawBuffer): void;
  /** Schedule playback. All three arguments are in seconds. */
  start(when?: number, offset?: number, duration?: number): void;
  /** Schedule the end of playback, in seconds. */
  stop(when?: number): void;
  /** Set `playbackRate` so the clip lasts `seconds`. */
  setDuration(seconds: number): void;
  /** The loaded clip's length in seconds at `playbackRate` 1, or 0. */
  readonly naturalDuration: number;
  /** Called once per playback, at the natural end or after `stop()`. */
  onended: (() => void) | null;

  dispose(): void;
};

const create = createWorkletConstructor<
  FlexAudioBufferSourceWorkletNode,
  FlexAudioBufferSourceInputs
>({
  processorName: "FlexAudioBufferSourceProcessor",
  descriptors: PARAMS,
  workletOptions: (inputs) => ({
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [inputs.channelCount ?? DEFAULT_CONFIG.channels],
    processorOptions: {
      frameMs: inputs.frameMs ?? DEFAULT_CONFIG.frameMs,
      overlap: inputs.overlap ?? DEFAULT_CONFIG.overlap,
      tolerance: inputs.tolerance ?? DEFAULT_CONFIG.tolerance,
      searchRate: inputs.searchRate ?? DEFAULT_CONFIG.searchRate,
    },
  }),
});

/**
 * A buffer player whose time and pitch move independently.
 *
 * ```ts
 * const src = FlexAudioBufferSource(ac, { playbackRate: 0.5, detune: 300 });
 * src.setBuffer(await ac.decodeAudioData(bytes));
 * src.connect(ac.destination);
 * src.start();
 * ```
 *
 * `playbackRate` stretches time and leaves pitch alone; `detune` shifts pitch
 * and leaves duration alone. Both are automatable AudioParams.
 */
export const FlexAudioBufferSource = Object.assign(
  (
    context: AudioContext,
    inputs: FlexAudioBufferSourceInputs = {},
  ): FlexAudioBufferSourceWorkletNode => {
    const node = create(context, inputs);
    let frames = 0;
    let playing = false;

    node.onended = null;
    node.port.onmessage = (event) => {
      if (event.data?.type !== "ENDED") return;
      playing = false;
      node.onended?.();
    };

    node.setBuffer = (buffer) => {
      const raw = toRaw(buffer);
      // Resample once, at load, rather than every block - the same policy
      // `decodeAudioData` follows. Legal on this thread because `resampler.ts`
      // touches no worklet globals; the same code runs inside the processor.
      const channels = resampleBuffer(
        raw.channels,
        raw.sampleRate,
        context.sampleRate,
      );
      frames = channels[0]?.length ?? 0;
      playing = false;
      node.port.postMessage(
        { type: "SET_BUFFER", channels },
        channels.map(toArrayBuffer),
      );
    };

    node.start = (when = 0, offset = 0, duration = 0) => {
      if (playing) {
        throw Error(
          "FlexAudioBufferSource is already playing: stop() it before starting again",
        );
      }
      if (frames === 0) throw Error("FlexAudioBufferSource has no buffer");
      playing = true;
      node.port.postMessage({
        type: "START",
        when: when > 0 ? when : context.currentTime,
        offset,
        duration,
      });
    };

    node.stop = (when = 0) => {
      // Release the guard here rather than waiting for ENDED to come back: the
      // round trip is a render quantum at best and never happens at all on a
      // suspended context, and `stop(); start()` is the retrigger idiom a
      // restartable source exists to allow. A later START clears any stop
      // still pending in the worklet, so this is safe for a scheduled stop too.
      playing = false;
      node.port.postMessage({
        type: "STOP",
        when: when > 0 ? when : context.currentTime,
      });
    };

    node.setDuration = (seconds) => {
      const natural = frames / context.sampleRate;
      if (!(seconds > 0) || natural === 0) return;
      node.playbackRate.value = natural / seconds;
    };

    return Object.defineProperty(node, "naturalDuration", {
      get: () => frames / context.sampleRate,
      enumerable: true,
    });
  },
  { descriptors: PARAMS },
);

/** Channel data and rate, from either accepted shape. */
function toRaw(buffer: AudioBuffer | RawBuffer): RawBuffer {
  if ("channels" in buffer) {
    // Copy: the caller keeps ownership of what they passed, and the arrays are
    // about to be transferred.
    return {
      channels: buffer.channels.map((channel) => channel.slice()),
      sampleRate: buffer.sampleRate,
    };
  }
  const channels: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    // `getChannelData` hands back the AudioBuffer's live array. Transferring
    // that would detach the caller's buffer, so copy before it leaves.
    channels.push(buffer.getChannelData(c).slice());
  }
  return { channels, sampleRate: buffer.sampleRate };
}

const toArrayBuffer = (channel: Float32Array) => channel.buffer as ArrayBuffer;

export { Compound, disposable } from "./_worklet";
export type {
  CompoundNode,
  ConnectedUnit,
  Connector,
  Disposable,
  ParamDescriptor,
  ParamInput,
} from "./_worklet";
