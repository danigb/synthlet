import {
  createLevelAnalyzer,
  LevelAnalyzer,
  LevelAnalyzerOptions,
} from "./dsp";

// The engine for pages the worklet cannot reach.
//
// `AudioWorklet` is `[SecureContext]` in the Web Audio IDL, so on a plain-http
// page `ac.audioWorklet` is not a rejected promise or a feature flag - it is
// `undefined`, and every ticket in this folder runs behind the throw that
// produces. A phone on the LAN at `http://192.168.1.20:3000`, an intranet tool,
// a kiosk, an https page inside an http iframe: none of them are secure
// contexts, and `http://localhost` is, which is exactly why nobody notices.
//
// `AnalyserNode` is not the fallback, because it would change what the number
// means: it down-mixes to mono and reports only the last N samples at the
// moment you ask. A meter that quietly reports a different quantity on http
// than on https is worse than one that throws.
//
// `ScriptProcessorNode` reports the same quantity from the same core. Its
// `onaudioprocess` runs on the main thread, so a long frame delays it - which
// is a late reading here and would be a dropout in the signal path. That is
// why this is a *tap* driver, and why ticket 15's native `GainNode`
// pass-through is what lets both modes use it: the audio never touches
// JavaScript on the main thread, only the reading does.
//
// This file is deliberately the only thing that would change if
// `ScriptProcessorNode` were ever actually removed.

/** The only buffer sizes a `ScriptProcessorNode` accepts. */
export const BUFFER_SIZES = [256, 512, 1024, 2048, 4096, 8192, 16384] as const;

/**
 * 1024 frames: 21 ms at 48 kHz, 23 ms at 44.1 - a frame and a half at 60 fps,
 * and invisible against a 1.5 s hold. Smaller buffers buy nothing a human can
 * see and cost main-thread events; larger ones start to lag the bar.
 */
export const DEFAULT_BUFFER_SIZE = 1024;

export function resolveBufferSize(value: number | undefined): number {
  if (value === undefined) return DEFAULT_BUFFER_SIZE;
  if (!(BUFFER_SIZES as readonly number[]).includes(value)) {
    throw RangeError(
      `LevelMeter: bufferSize must be one of ${BUFFER_SIZES.join(", ")}, got ${value}`,
    );
  }
  return value;
}

/** What the driver needs from the meter, and all of it. */
export type ScriptProcessorHost = {
  /** The levels view to write each buffer's readings into. */
  readonly view: Float32Array;
  readonly analyzerOptions: LevelAnalyzerOptions;
  /** Called once the view has been written, to bump `version` and notify. */
  written(): void;
};

export type ScriptProcessorDriver = {
  readonly node: ScriptProcessorNode;
  /** The core, so the meter can route `clearClip` and the session commands. */
  readonly analyzer: LevelAnalyzer;
  readonly bufferSize: number;
  dispose(): void;
};

export type ScriptProcessorOptions = {
  bufferSize?: number;
  inputChannels?: number;
};

/**
 * Meter `source` from the main thread, over the same core the worklet runs.
 *
 * Adds a second outgoing edge exactly as the worklet tap does, plus a silent
 * path to the destination that keeps the browser calling it.
 */
export function createScriptProcessorDriver(
  source: AudioNode,
  output: number,
  host: ScriptProcessorHost,
  options: ScriptProcessorOptions = {},
): ScriptProcessorDriver {
  const context = source.context;
  const bufferSize = resolveBufferSize(options.bufferSize);
  // A `ScriptProcessorNode`'s input channel count is fixed at construction, so
  // unlike the worklet this driver cannot follow a source that changes its
  // own. `source.channelCount` is the best guess available at construction and
  // `inputChannels` is the override.
  const inputChannels = options.inputChannels ?? source.channelCount ?? 2;

  const analyzer = createLevelAnalyzer(
    context.sampleRate,
    host.analyzerOptions,
  );

  // `createScriptProcessor` rather than `new ScriptProcessorNode(...)`: the
  // constructor form was never added, because the interface was deprecated
  // before Web Audio grew constructors.
  const node = context.createScriptProcessor(bufferSize, inputChannels, 1);

  // Reused across events, so `onaudioprocess` allocates nothing.
  const channels: Float32Array[] = [];

  node.onaudioprocess = (event: AudioProcessingEvent) => {
    const input = event.inputBuffer;
    channels.length = input.numberOfChannels;
    for (let c = 0; c < input.numberOfChannels; c++) {
      channels[c] = input.getChannelData(c);
    }

    // One call rather than eight 128-frame slices: the core carries a partial
    // frame across calls and applies the ballistics once per `ANALYSIS_FRAME`,
    // so a 1024-frame buffer decays the same eight times the worklet would.
    // Slicing here would be the same arithmetic written twice, and the test
    // that asserts both engines read identically is what holds it to that.
    analyzer.process(channels, 0, input.length);
    // Straight into the levels view. Same thread as the reader, so there is no
    // transport here at all - no shared buffer, no posted copy.
    analyzer.results(host.view);
    host.written();
  };

  source.connect(node, output);

  // Chrome has historically not fired `onaudioprocess` on a node whose output
  // goes nowhere. This is the zero-gain sink ticket 08 names as its fallback,
  // applied where it is known to be needed rather than everywhere.
  const sink = context.createGain();
  sink.gain.value = 0;
  node.connect(sink);
  sink.connect(context.destination);

  return {
    node,
    analyzer,
    bufferSize,
    dispose() {
      node.onaudioprocess = null;
      source.disconnect(node, output);
      node.disconnect();
      sink.disconnect();
    },
  };
}
