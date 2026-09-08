/**
 * The loudness core, as the two drivers and the factory see it.
 *
 * `loudness.test.ts` decides whether the numbers are right - it is EBU Tech
 * 3341 and 3342 against the pure core. This file only asks whether the wiring
 * carries them: that the option reaches the core, that the tail slots hold what
 * the accessor claims, that "not measured" and "silent" stay different answers,
 * and that offline and realtime leave the layout in the same state.
 */

import {
  ANALYSIS_FRAME,
  BS1770_50_CHANNEL_WEIGHTS,
  levelsLength,
  levelsTailIndex,
} from "./dsp";
import { analyze } from "./offline";
import { createWorkletTestContext } from "./test-utils";

const SAMPLE_RATE = 48000;

// EBU Tech 3341's own test signal: 1000 Hz, and for an in-phase stereo pair the
// per-channel peak level in dBFS is also the loudness in LUFS.
function ebuTone(seconds: number, dbfs: number, channelCount = 2) {
  const length = Math.round(seconds * SAMPLE_RATE);
  const amplitude = dbfs === -Infinity ? 0 : Math.pow(10, dbfs / 20);
  const omega = (2 * Math.PI * 1000) / SAMPLE_RATE;
  const channel = Float32Array.from(
    { length },
    (_, i) => amplitude * Math.sin(omega * i),
  );
  return Array.from({ length: channelCount }, () => channel);
}

/** Levels are within EBU Tech 3341 Table 1's +/-0.1 LU. */
function expectLufs(actual: number, expected: number) {
  expect(actual).toBeGreaterThanOrEqual(expected - 0.1);
  expect(actual).toBeLessThanOrEqual(expected + 0.1);
}

describe("loudness offline", () => {
  it("reads momentary and short-term when asked, NaN when not", async () => {
    const channels = ebuTone(4, -23);

    const off = await analyze(channels, SAMPLE_RATE, { maxChannels: 2 });
    expect(off.momentary).toBeNaN();
    expect(off.shortTerm).toBeNaN();

    const on = await analyze(channels, SAMPLE_RATE, {
      maxChannels: 2,
      loudness: true,
    });
    expectLufs(on.momentary, -23);
    expectLufs(on.shortTerm, -23);
  });

  /**
   * The distinction the tail cannot carry itself.
   *
   * `NaN` never equals itself, so a `NaN` in the view would make `readView`'s
   * change check fire on every block and wake every subscriber sixty times a
   * second over a reading that never moved. So the buffer holds a real number
   * or nothing at all, and the accessor is what maps "off" to `NaN` - the same
   * arrangement true peak already uses for its per-channel slot.
   */
  it("leaves the tail slots untouched while loudness is off", async () => {
    const analysis = await analyze(ebuTone(1, -23), SAMPLE_RATE, {
      maxChannels: 2,
    });
    const tail = analysis.levels.slice(levelsTailIndex(2));
    expect(tail.length).toBeGreaterThan(0);
    expect(tail.every((slot) => slot === 0)).toBe(true);
  });

  it("reads -Infinity for silence, not a floor", async () => {
    const analysis = await analyze(ebuTone(1, -Infinity), SAMPLE_RATE, {
      maxChannels: 2,
      loudness: true,
    });
    expect(analysis.momentary).toBe(-Infinity);
    expect(analysis.shortTerm).toBe(-Infinity);
  });

  /**
   * BS.1770-5 Annex 1 Table 3 weights Ls and Rs at 1.41, and nothing infers
   * that from a channel count. Tech 3341 case 6 is the signal that makes the
   * difference visible: five channels at -28, -28, -24, -30, -30 dBFS read
   * -23 LUFS with the weights and 0.4 LU low without them.
   */
  it("carries channelWeights through to the core", async () => {
    const levels = [-28, -28, -24, -30, -30];
    const channels = levels.map((db) => ebuTone(1, db, 1)[0]);

    const weighted = await analyze(channels, SAMPLE_RATE, {
      maxChannels: 5,
      loudness: true,
      channelWeights: BS1770_50_CHANNEL_WEIGHTS,
    });
    const flat = await analyze(channels, SAMPLE_RATE, {
      maxChannels: 5,
      loudness: true,
    });

    expectLufs(weighted.momentary, -23);
    expect(flat.momentary).toBeLessThan(weighted.momentary - 0.3);
  });
});

// The whole point of ticket 09's seam: one implementation, so the two drivers
// cannot disagree about a number a user can see.
describe("loudness offline against realtime", () => {
  let Processor: any;

  beforeAll(async () => {
    createWorkletTestContext(SAMPLE_RATE);
    Processor = (await import("./worklet")).LevelMeterProcessor;
  });

  it("leaves the layout in exactly the same state", async () => {
    const maxChannels = 2;
    const channels = ebuTone(3.5, -23);
    const frames = Math.floor(channels[0].length / ANALYSIS_FRAME);

    const realtime = new Float32Array(levelsLength(maxChannels));
    const processor = new Processor({
      processorOptions: {
        maxChannels,
        loudness: true,
        levelsBuffer: realtime.buffer,
      },
    });
    for (let frame = 0; frame < frames; frame++) {
      const offset = frame * ANALYSIS_FRAME;
      const block = channels.map((c) =>
        c.subarray(offset, offset + ANALYSIS_FRAME),
      );
      processor.process(
        [block],
        [block.map(() => new Float32Array(ANALYSIS_FRAME))],
        {},
      );
    }

    // Chunked on a boundary that is neither a frame nor a sub-block, so the
    // agreement is about the arithmetic and not about the two paths happening
    // to cut the signal in the same places.
    const offline = await analyze(
      channels.map((c) => c.subarray(0, frames * ANALYSIS_FRAME)),
      SAMPLE_RATE,
      { maxChannels, loudness: true, chunkSize: 5000 },
    );

    expect(Array.from(offline.levels)).toEqual(Array.from(realtime));
    expectLufs(offline.momentary, -23);
  });
});

// ---------------------------------------------------------------------------
// The factory
// ---------------------------------------------------------------------------

class AudioNodeStub {
  connect = jest.fn();
  disconnect = jest.fn();
  numberOfOutputs = 1;
  constructor(readonly context: unknown = {}) {}
}

class AudioWorkletNodeStub extends AudioNodeStub {
  port = { postMessage: jest.fn(), onmessage: null as any };
  onprocessorerror: ((event: Event) => void) | null = null;
  constructor(
    context: unknown,
    readonly processorName: string,
    readonly options: AudioWorkletNodeOptions,
  ) {
    super(context);
  }
}

const HEADER = 3;
const STRIDE = 4;

describe("the factory's loudness options", () => {
  let LevelMeter: typeof import("./index").LevelMeter;
  const constructed: AudioWorkletNodeStub[] = [];

  beforeAll(async () => {
    // `disposable` tests its dependencies with `instanceof AudioNode`.
    (global as any).AudioNode = AudioNodeStub;
    (global as any).AudioWorkletNode = class extends AudioWorkletNodeStub {
      constructor(c: unknown, name: string, o: AudioWorkletNodeOptions) {
        super(c, name, o);
        constructed.push(this);
      }
    };
    LevelMeter = (await import("./index")).LevelMeter;
  });

  /** A tap, its worklet built - `ready` is when `processorOptions` has landed. */
  async function tapped(options: Parameters<typeof LevelMeter.tap>[1] = {}) {
    const context = {
      audioWorklet: { addModule: async () => {} },
    } as unknown as AudioContext;
    const source = new AudioNodeStub(context) as unknown as AudioNode;
    const meter = LevelMeter.tap(source, options);
    await meter.ready;
    const node = constructed[constructed.length - 1];
    return { meter, node };
  }

  it("hands loudness and the weights to the processor", async () => {
    const plain = await tapped({ maxChannels: 2 });
    const plainOptions = plain.node.options.processorOptions as any;
    expect(plainOptions.loudness).toBeUndefined();
    expect(plainOptions.channelWeights).toBeUndefined();

    const loud = await tapped({
      maxChannels: 5,
      loudness: true,
      channelWeights: BS1770_50_CHANNEL_WEIGHTS,
    });
    const loudOptions = loud.node.options.processorOptions as any;
    expect(loudOptions.loudness).toBe(true);
    // A plain array, because `processorOptions` is structured-cloned and a
    // frozen `readonly number[]` is the one shape that would not survive.
    expect(Array.isArray(loudOptions.channelWeights)).toBe(true);
    expect(loudOptions.channelWeights).toEqual([1, 1, 1, 1.41, 1.41]);
  });

  it("reads the tail through the accessor, and NaN when loudness is off", async () => {
    const post = (node: AudioWorkletNodeStub, tailValues: number[]) => {
      const maxChannels = 2;
      const view = new Float32Array(levelsLength(maxChannels));
      view[0] = 1;
      view[1] = 2;
      const tail = HEADER + maxChannels * STRIDE;
      tailValues.forEach((value, i) => (view[tail + i] = value));
      node.port.onmessage!({ data: view } as MessageEvent);
    };

    const off = await tapped({ maxChannels: 2 });
    post(off.node, [-23, -24]);
    expect(off.meter.getLevels().momentary).toBeNaN();
    expect(off.meter.getLevels().shortTerm).toBeNaN();

    const on = await tapped({ maxChannels: 2, loudness: true });
    post(on.node, [-23, -24]);
    expect(on.meter.getLevels().momentary).toBe(-23);
    expect(on.meter.getLevels().shortTerm).toBe(-24);

    // Silence is a reading, not an absence - the distinction NaN is reserved
    // for.
    post(on.node, [-Infinity, -Infinity]);
    expect(on.meter.getLevels().momentary).toBe(-Infinity);
  });
});
