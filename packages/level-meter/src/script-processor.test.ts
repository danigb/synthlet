import { createLevelAnalyzer, levelsLength, LEVELS_HEADER } from "./dsp";
import {
  BUFFER_SIZES,
  createScriptProcessorDriver,
  DEFAULT_BUFFER_SIZE,
  resolveBufferSize,
} from "./script-processor";
import { createWorkletTestContext } from "./test-utils";

// The http driver, and the assertion the whole ticket rests on: that it and the
// worklet report the *same* numbers. `AnalyserNode` was rejected as the
// fallback precisely because it would not, and a meter that quietly reports a
// different quantity on http than on https is worse than one that throws.

const SAMPLE_RATE = 48000;
const MAX_CHANNELS = 16;

class AudioNodeStub {
  connect = jest.fn();
  disconnect = jest.fn();
  channelCount = 2;
  constructor(readonly context: any) {}
}

class GainNodeStub extends AudioNodeStub {
  gain = { value: 1 };
}

class ScriptProcessorNodeStub extends AudioNodeStub {
  onaudioprocess: ((event: any) => void) | null = null;
  constructor(
    context: any,
    readonly bufferSize: number,
    readonly inputChannels: number,
    readonly outputChannels: number,
  ) {
    super(context);
  }
}

function createContext() {
  const context: any = {
    sampleRate: SAMPLE_RATE,
    destination: null as any,
    gains: [] as GainNodeStub[],
    processors: [] as ScriptProcessorNodeStub[],
    createGain() {
      const gain = new GainNodeStub(context);
      context.gains.push(gain);
      return gain;
    },
    createScriptProcessor(
      bufferSize: number,
      inputChannels: number,
      outputChannels: number,
    ) {
      const node = new ScriptProcessorNodeStub(
        context,
        bufferSize,
        inputChannels,
        outputChannels,
      );
      context.processors.push(node);
      return node;
    },
  };
  context.destination = new AudioNodeStub(context);
  return context;
}

/**
 * What the browser hands `onaudioprocess` - the three members the driver reads.
 * Cast, because the real event carries twenty more that it does not.
 */
function audioProcessingEvent(blocks: Float32Array[]): AudioProcessingEvent {
  return {
    inputBuffer: {
      length: blocks[0].length,
      numberOfChannels: blocks.length,
      getChannelData: (c: number) => blocks[c],
    },
  } as unknown as AudioProcessingEvent;
}

function host(maxChannels = MAX_CHANNELS, options: object = {}) {
  return {
    view: new Float32Array(levelsLength(maxChannels)),
    analyzerOptions: { maxChannels, ...options },
    written: jest.fn(),
  };
}

const sourceStub = (context: any) =>
  new AudioNodeStub(context) as unknown as AudioNode;

/** A different waveform per channel, so an aliasing bug cannot hide. */
function ramp(length: number, channel: number) {
  const block = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    block[i] = Math.sin((i * (channel + 1)) / 7) * (0.9 - channel * 0.1);
  }
  return block;
}

describe("bufferSize", () => {
  it("defaults to 1024 - 21 ms at 48 kHz", () => {
    expect(resolveBufferSize(undefined)).toBe(DEFAULT_BUFFER_SIZE);
    expect(DEFAULT_BUFFER_SIZE).toBe(1024);
  });

  it.each(BUFFER_SIZES)("accepts %i", (size) => {
    expect(resolveBufferSize(size)).toBe(size);
  });

  // A ScriptProcessorNode throws IndexSizeError on anything else, from inside
  // the constructor, which is not where a caller looks.
  it.each([0, 100, 1000, 1023, 32768, -1024, NaN])("refuses %p", (size) => {
    expect(() => resolveBufferSize(size)).toThrow(RangeError);
  });

  // Every allowed size is a whole number of render quanta, which is what makes
  // the two engines' ballistics line up exactly.
  it.each(BUFFER_SIZES)("%i is a whole number of 128-frame quanta", (size) => {
    expect(size % 128).toBe(0);
  });
});

describe("the driver", () => {
  it("taps the source and keeps a silent path to the destination", () => {
    const context = createContext();
    const source = sourceStub(context);
    createScriptProcessorDriver(source, 0, host());

    const node = context.processors[0];
    expect(source.connect).toHaveBeenCalledWith(node, 0);

    // Chrome has historically not fired `onaudioprocess` on a node whose output
    // goes nowhere.
    const sink = context.gains[0];
    expect(sink.gain.value).toBe(0);
    expect(node.connect).toHaveBeenCalledWith(sink);
    expect(sink.connect).toHaveBeenCalledWith(context.destination);
  });

  it("asks for one output channel and the source's channel count", () => {
    const context = createContext();
    const source = sourceStub(context);
    (source as any).channelCount = 4;
    createScriptProcessorDriver(source, 0, host());

    const node = context.processors[0];
    expect(node.inputChannels).toBe(4);
    expect(node.outputChannels).toBe(1);
    expect(node.bufferSize).toBe(1024);
  });

  it("takes inputChannels and bufferSize as overrides", () => {
    const context = createContext();
    createScriptProcessorDriver(sourceStub(context), 0, host(), {
      bufferSize: 256,
      inputChannels: 1,
    });

    expect(context.processors[0].bufferSize).toBe(256);
    expect(context.processors[0].inputChannels).toBe(1);
  });

  it("writes the view and notifies once per buffer", () => {
    const context = createContext();
    const target = host();
    const driver = createScriptProcessorDriver(sourceStub(context), 0, target);

    driver.node.onaudioprocess!(
      audioProcessingEvent([ramp(1024, 0), ramp(1024, 1)]),
    );

    expect(target.written).toHaveBeenCalledTimes(1);
    expect(target.view[1]).toBe(2); // channel count, from the buffer
    expect(target.view[LEVELS_HEADER]).toBeGreaterThan(0); // channel 0 peak

    driver.node.onaudioprocess!(
      audioProcessingEvent([ramp(1024, 0), ramp(1024, 1)]),
    );
    expect(target.written).toHaveBeenCalledTimes(2);
  });

  it("takes the tap edge and the sink down on dispose", () => {
    const context = createContext();
    const source = sourceStub(context);
    const driver = createScriptProcessorDriver(source, 0, host());
    const node = context.processors[0];

    driver.dispose();

    expect(node.onaudioprocess).toBeNull();
    expect(source.disconnect).toHaveBeenCalledWith(node, 0);
    expect(node.disconnect).toHaveBeenCalled();
    expect(context.gains[0].disconnect).toHaveBeenCalled();
  });

  it("connects the output it was asked for", () => {
    const context = createContext();
    const source = sourceStub(context);
    createScriptProcessorDriver(source, 2, host());
    expect(source.connect).toHaveBeenCalledWith(context.processors[0], 2);
  });
});

// Success criterion 2: the same input produces identical readings on both
// engines - asserted, not observed.
describe("against the worklet", () => {
  let Processor: any;

  beforeAll(async () => {
    createWorkletTestContext(SAMPLE_RATE);
    Processor = (await import("./worklet")).LevelMeterProcessor;
  });

  /** The worklet processor, fed one render quantum at a time. */
  function workletReadings(
    buffers: Float32Array[][],
    options: object,
  ): Float32Array {
    const processor = new Processor({
      processorOptions: { maxChannels: MAX_CHANNELS, ...options },
    });
    for (const buffer of buffers) {
      const length = buffer[0].length;
      for (let offset = 0; offset < length; offset += 128) {
        const quantum = buffer.map((channel) =>
          channel.subarray(offset, offset + 128),
        );
        processor.process([quantum], [], {});
      }
    }
    // `v` is the processor's own levels view.
    return Float32Array.from(processor.v);
  }

  /** The same buffers, through `onaudioprocess`. */
  function driverReadings(
    buffers: Float32Array[][],
    options: object,
  ): Float32Array {
    const context = createContext();
    const target = host(MAX_CHANNELS, options);
    const driver = createScriptProcessorDriver(sourceStub(context), 0, target, {
      bufferSize: buffers[0][0].length as any,
    });
    for (const buffer of buffers) {
      driver.node.onaudioprocess!(audioProcessingEvent(buffer));
    }
    return target.view;
  }

  const stereo = (length: number) => [ramp(length, 0), ramp(length, 1)];

  it.each(BUFFER_SIZES)(
    "reads identically at a %i-frame buffer",
    (bufferSize) => {
      const buffers = [stereo(bufferSize), stereo(bufferSize)];
      expect(Array.from(driverReadings(buffers, {}))).toEqual(
        Array.from(workletReadings(buffers, {})),
      );
    },
  );

  // The one that would catch a driver feeding the core a whole buffer at a
  // time if the core did not chunk: release is derived per 128-frame quantum,
  // so a 1024-frame buffer has to decay eight times, not once.
  it("decays identically across a 1024-frame buffer of silence", () => {
    const loud = [
      [new Float32Array(1024).fill(1), new Float32Array(1024).fill(1)],
    ];
    const silence = Array.from({ length: 8 }, () => [
      new Float32Array(1024),
      new Float32Array(1024),
    ]);
    const buffers = [...loud, ...silence];

    const fromDriver = driverReadings(buffers, {});
    const fromWorklet = workletReadings(buffers, {});

    // It really did fall - otherwise this asserts that two frozen numbers match.
    expect(fromDriver[LEVELS_HEADER]).toBeLessThan(0.9);
    expect(fromDriver[LEVELS_HEADER]).toBeGreaterThan(0);
    expect(Array.from(fromDriver)).toEqual(Array.from(fromWorklet));
  });

  it.each([
    ["true peak", { truePeak: true }],
    ["loudness", { loudness: true }],
    ["both", { truePeak: true, loudness: true }],
  ])("reads identically with %s on", (_name, options) => {
    const buffers = [stereo(1024), stereo(1024), stereo(1024)];
    expect(Array.from(driverReadings(buffers, options))).toEqual(
      Array.from(workletReadings(buffers, options)),
    );
  });

  it("agrees with a bare analyzer over the same samples", () => {
    const buffers = [stereo(1024), stereo(1024)];
    const analyzer = createLevelAnalyzer(SAMPLE_RATE, {
      maxChannels: MAX_CHANNELS,
    });
    for (const buffer of buffers) analyzer.process(buffer, 0, 1024);

    expect(Array.from(driverReadings(buffers, {}))).toEqual(
      Array.from(analyzer.results()),
    );
  });
});
