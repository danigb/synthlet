/**
 * Every code sample in `README.md`, pasted and run.
 *
 * A README is documentation that compiles against nothing, so it rots silently
 * - and this package's previous docs page taught three calls that did not
 * exist. The rule here is the one ticket 13 sets: a sample is checked by
 * running it, not by reading it.
 *
 * Not covered here, and why:
 *
 *   Build your own 1, 2, 3   already pasted and run in `index.test.ts`'s
 *                            "README recipes" group (the DOM meter and the
 *                            React hook) and `meter-ui.test.ts`'s `attach`
 *                            group (the canvas one). Duplicating them would
 *                            mean two copies to keep in step with one README.
 *   The CSS block            not code this package runs.
 *   `npm i`                  not code at all.
 *
 * Samples are marked `--- README ---` / `--- end ---`, and inside those markers
 * the text is verbatim apart from binding the identifiers the README leaves to
 * the reader (`source`, `ac`, `canvas`, `bar`, `buffer`, `channels`).
 */

import {
  analyze,
  analyzeAudioBuffer,
  BS1770_51_CHANNEL_WEIGHTS,
  gainToTarget,
  kWeightingCoefficients,
  LEVELS_HEADER,
  LEVELS_STRIDE,
  levelsLength,
  TRUE_PEAK_CEILING_DBTP,
} from "./dsp-entry";

// ---------------------------------------------------------------------------
// Enough Web Audio to run a sample
// ---------------------------------------------------------------------------

class AudioNodeStub {
  disconnect = jest.fn();
  numberOfOutputs = 2;
  constructor(readonly context: unknown = {}) {}
  // Web Audio returns the destination, which is what makes `a.connect(b)
  // .connect(c)` a chain.
  connect = jest.fn((destination: unknown) => destination);
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

const built: AudioWorkletNodeStub[] = [];

/** A context that can register a worklet and make a gain node. */
function audioContext() {
  const context: any = {
    audioWorklet: { addModule: async () => {} },
    createGain: () => new AudioNodeStub(context),
  };
  context.destination = new AudioNodeStub(context);
  return context as AudioContext & { destination: AudioNodeStub };
}

/** What the processor posts: one pre-shaped array carrying the whole layout. */
function frame(
  maxChannels: number,
  channels: { peak?: number; hold?: number; rms?: number; truePeak?: number }[],
  tail: number[] = [],
  flags = 0,
) {
  const view = new Float32Array(levelsLength(maxChannels));
  view[0] = 1;
  view[1] = channels.length;
  view[2] = flags;
  channels.forEach(({ peak = 0, hold = 0, rms = 0, truePeak = 0 }, c) => {
    const slot = LEVELS_HEADER + c * LEVELS_STRIDE;
    view[slot] = peak;
    view[slot + 1] = hold;
    view[slot + 2] = rms;
    view[slot + 3] = truePeak;
  });
  const at = LEVELS_HEADER + maxChannels * LEVELS_STRIDE;
  tail.forEach((value, i) => (view[at + i] = value));
  return view;
}

// The animation frame, under test control: `subscribe` and `attach` are both
// defined in terms of frames.
const pending = new Map<number, (now: number) => void>();
let nextHandle = 1;

function runFrame(now = 0) {
  const due = Array.from(pending.values());
  pending.clear();
  for (const callback of due) callback(now);
}

let LevelMeter: typeof import("./index").LevelMeter;
let LevelMeterUI: typeof import("./index").LevelMeterUI;
let dbToUnit: typeof import("./index").dbToUnit;
let formatDb: typeof import("./index").formatDb;

beforeAll(async () => {
  (global as any).AudioNode = AudioNodeStub;
  (global as any).AudioWorkletNode = class extends AudioWorkletNodeStub {
    constructor(c: unknown, name: string, o: AudioWorkletNodeOptions) {
      super(c, name, o);
      built.push(this);
    }
  };
  (globalThis as any).requestAnimationFrame = (cb: (now: number) => void) => {
    const handle = nextHandle++;
    pending.set(handle, cb);
    return handle;
  };
  (globalThis as any).cancelAnimationFrame = (handle: number) =>
    pending.delete(handle);

  const entry = await import("./index");
  LevelMeter = entry.LevelMeter;
  LevelMeterUI = entry.LevelMeterUI;
  dbToUnit = entry.dbToUnit;
  formatDb = entry.formatDb;
});

/** A tap whose worklet has been built, plus the stub node behind it. */
async function tapped(options: Record<string, unknown> = {}) {
  const context = audioContext();
  const source = new AudioNodeStub(context) as unknown as AudioNode;
  const meter = LevelMeter.tap(source, options);
  await meter.ready;
  return { context, source, meter, node: built[built.length - 1] };
}

const deliver = (node: AudioWorkletNodeStub, view: Float32Array) =>
  node.port.onmessage!({ data: view } as MessageEvent);

// ---------------------------------------------------------------------------

describe("README: the opening sample", () => {
  it("taps a node and reads a peak in dBFS", async () => {
    const { meter, node } = await tapped();
    deliver(node, frame(16, [{ peak: 0.5 }]));

    // --- README ---
    meter.getLevels().peak(0); // dBFS, -Infinity for silence
    // --- end ---

    expect(meter.getLevels().peak(0)).toBeCloseTo(20 * Math.log10(0.5), 6);
    meter.dispose();
  });
});

describe("README: quick start", () => {
  // Enough canvas for one render. The renderer has no `document` dependency,
  // which is why a stub this small is enough.
  function canvasStub(width = 200, height = 40) {
    const gradient = { addColorStop: () => {} };
    const context = new Proxy(
      {
        createLinearGradient: () => gradient,
        createPattern: () => ({}),
      } as any,
      {
        get: (target, key) =>
          key in target ? target[key] : (target[key] = () => undefined),
        set: (target, key, value) => ((target[key] = value), true),
      },
    );
    return {
      width,
      height,
      clientWidth: width,
      clientHeight: height,
      getContext: () => context,
      getBoundingClientRect: () => ({ width, height }),
      cloneNode: () => canvasStub(width, height),
    };
  }

  it("attaches the canvas renderer to a tap", async () => {
    const canvas = canvasStub() as unknown as HTMLCanvasElement;
    const { meter, node } = await tapped();

    // --- README ---
    const ui = new LevelMeterUI({ minDb: -40, maxDb: 0 });
    ui.attach(canvas, meter);
    // --- end ---

    deliver(node, frame(16, [{ peak: 1, hold: 1, rms: 0.7 }]));
    runFrame();
    expect(ui.canvas).toBe(canvas);

    ui.detach();
    meter.dispose();
  });

  it("resolves ready once the meter is measuring", async () => {
    const context = audioContext();
    const source = new AudioNodeStub(context) as unknown as AudioNode;
    const meter = LevelMeter.tap(source);

    // --- README ---
    await meter.ready;
    // --- end ---

    expect(meter.engine).toBe("worklet");
    meter.dispose();
  });
});

describe("README: tap, or pass-through", () => {
  it("adds an edge and removes it again", async () => {
    const context = audioContext();
    const source = new AudioNodeStub(context) as unknown as AudioNode;

    // --- README ---
    const meter = LevelMeter.tap(source); // adds an edge; changes nothing else
    // --- end ---
    await meter.ready;
    expect(source.connect).toHaveBeenCalledTimes(1);

    // --- README ---
    meter.dispose(); // removes it
    // --- end ---
    expect(source.disconnect).toHaveBeenCalledTimes(1);
  });

  it("passes through, in the path", async () => {
    const ac = audioContext();
    const source = new AudioNodeStub(ac) as unknown as AudioNode;

    // --- README ---
    const meter = LevelMeter(ac); // pass-through: audio in, same audio out
    source.connect(meter).connect(ac.destination);
    // --- end ---

    await meter.ready;
    expect(source.connect).toHaveBeenCalledWith(meter);
    expect((meter as any).connect).toHaveBeenCalledWith(ac.destination);
    meter.dispose();
  });

  it("reports a dead processor", async () => {
    const context = audioContext();
    const source = new AudioNodeStub(context) as unknown as AudioNode;
    const warned: unknown[] = [];
    const console = { warn: (...args: unknown[]) => warned.push(args) };

    // --- README ---
    LevelMeter.tap(source, {
      onError: (event) => console.warn("meter died", event),
    });
    // --- end ---

    const meter = built[built.length - 1];
    // The tap is still registering; the handler is wired when the node lands.
    await Promise.resolve();
    await Promise.resolve();
    built[built.length - 1].onprocessorerror?.(new Event("processorerror"));
    expect(warned).toHaveLength(1);
    expect(meter).toBeDefined();
  });
});

describe("README: reading them", () => {
  it("runs the getLevels() block", async () => {
    const { meter, node } = await tapped({ maxChannels: 4 });
    deliver(
      node,
      frame(4, [{ peak: 1, hold: 1, rms: 0.5 }, { peak: 0 }], [], 0b1),
    );

    // --- README ---
    const levels = meter.getLevels();
    levels.channelCount; // 2 - from the source, not from you
    levels.peak(0); // dBFS, -Infinity for silence
    levels.hold(0); // the hold marker
    levels.rms(0);
    levels.clipped(0); // boolean
    levels.clearClip();
    levels.snapshot(); // a plain object, when you need to keep one
    // --- end ---

    expect(levels.channelCount).toBe(2);
    expect(levels.peak(0)).toBeCloseTo(0, 6);
    expect(levels.peak(1)).toBe(-Infinity);
    expect(levels.snapshot().rms).toHaveLength(2);
    // "Not measured" is NaN, and silence is -Infinity.
    expect(levels.truePeak(0)).toBeNaN();
    expect(levels.momentary).toBeNaN();
    expect(levels.shortTerm).toBeNaN();
    expect(meter.getLevels()).toBe(levels);
    meter.dispose();
  });

  it("runs the subscribe block", async () => {
    const { meter, node } = await tapped({ maxChannels: 2 });
    const logged: unknown[][] = [];
    const console = { log: (...args: unknown[]) => logged.push(args) };

    // --- README ---
    const stop = meter.subscribe((levels) => {
      console.log(levels.peak(0), levels.version);
    });
    // --- end ---

    deliver(node, frame(2, [{ peak: 0.5 }, { peak: 0.25 }]));
    expect(logged).toHaveLength(1);
    expect(logged[0][0]).toBeCloseTo(20 * Math.log10(0.5), 6);

    // --- README ---
    stop();
    // --- end ---

    deliver(node, frame(2, [{ peak: 1 }, { peak: 1 }]));
    expect(logged).toHaveLength(1);
    meter.dispose();
  });

  it("still answers getPeaks(), deprecated", async () => {
    const { meter, node } = await tapped({ maxChannels: 4 });
    deliver(node, frame(4, [{ peak: 0.5 }, { peak: 0.25 }]));
    expect(Array.from(meter.getPeaks())).toEqual([0.5, 0.25, 0, 0]);
    meter.dispose();
  });
});

describe("README: opt in", () => {
  it("reads true peak and loudness once asked for", async () => {
    const context = audioContext();
    const master = new AudioNodeStub(context) as unknown as AudioNode;

    // --- README ---
    const meter = LevelMeter.tap(master, { truePeak: true, loudness: true });
    // --- end ---
    await meter.ready;
    const node = built[built.length - 1];
    deliver(node, frame(16, [{ peak: 0.5, truePeak: 0.6 }], [-23, -24, -25]));

    // --- README ---
    meter.getLevels().truePeak(0); // dBTP
    meter.getLevels().momentary; // LUFS over the last 400 ms
    meter.getLevels().shortTerm; // LUFS over the last 3 s
    // --- end ---

    expect(meter.getLevels().truePeak(0)).toBeCloseTo(20 * Math.log10(0.6), 5);
    expect(meter.getLevels().momentary).toBe(-23);
    expect(meter.getLevels().shortTerm).toBe(-24);
    expect(TRUE_PEAK_CEILING_DBTP).toBe(-1);
    meter.dispose();
  });

  it("runs the integration session block", async () => {
    const { meter, node } = await tapped({ maxChannels: 2, loudness: true });

    // --- README ---
    meter.startIntegration(); // the programme starts here
    meter.integrated; // LUFS since then; -Infinity until there is something
    meter.stopIntegration(); // pause; the reading stands
    meter.resetIntegration(); // discard it
    // --- end ---

    expect(
      node.port.postMessage.mock.calls.map((c: any[]) => c[0].type),
    ).toEqual(["START_INTEGRATION", "STOP_INTEGRATION", "RESET_INTEGRATION"]);
    deliver(node, frame(2, [{ peak: 0.5 }], [-23, -24, -22]));
    expect(meter.integrated).toBe(-22);
    meter.dispose();
  });

  it("runs the surround-weights block", async () => {
    const context = audioContext();
    const bus = new AudioNodeStub(context) as unknown as AudioNode;

    // --- README ---
    const meter = LevelMeter.tap(bus, {
      loudness: true,
      channelWeights: BS1770_51_CHANNEL_WEIGHTS,
    });
    // --- end ---

    await meter.ready;
    const options = built[built.length - 1].options.processorOptions as any;
    // L R C LFE Ls Rs - the LFE excluded, the surrounds at 1.41.
    expect(options.channelWeights).toEqual([1, 1, 1, 0, 1.41, 1.41]);
    meter.dispose();
  });

  it("derives the K-weighting coefficients at any rate", () => {
    // --- README ---
    kWeightingCoefficients(44100);
    // --- end ---
    expect(kWeightingCoefficients(44100).shelf.b0).toBeCloseTo(1.53084123, 6);
    expect(kWeightingCoefficients(48000).shelf.b0).toBeCloseTo(1.53512486, 6);
  });
});

// ---------------------------------------------------------------------------
// Offline: no stubs at all, because there is nothing to stub
// ---------------------------------------------------------------------------

const SAMPLE_RATE = 48000;

/** A 1 kHz stereo sine at `dbfs` peak, which is also its loudness in LUFS. */
function tone(seconds: number, dbfs: number) {
  const length = Math.round(seconds * SAMPLE_RATE);
  const amplitude = Math.pow(10, dbfs / 20);
  const omega = (2 * Math.PI * 1000) / SAMPLE_RATE;
  const channel = Float32Array.from(
    { length },
    (_, i) => amplitude * Math.sin(omega * i),
  );
  return [channel, channel];
}

describe("README: offline analysis", () => {
  it("runs the analyze block", async () => {
    const channels = tone(4, -23);
    const sampleRate = SAMPLE_RATE;

    // --- README ---
    const analysis = await analyze(channels, sampleRate, {
      truePeak: true,
      loudness: true,
    });

    analysis.peak; // dBFS per channel, the highest anywhere in the buffer
    analysis.truePeak; // dBTP per channel
    analysis.rms; // dBFS per channel, where the buffer ends
    analysis.clipped; // boolean per channel
    analysis.integrated; // LUFS over the whole buffer
    analysis.lra; // LU
    analysis.duration; // seconds
    // --- end ---

    expect(analysis.peak[0]).toBeCloseTo(-23, 2);
    expect(analysis.truePeak[0]).toBeGreaterThan(analysis.peak[0] - 0.5);
    expect(analysis.rms).toHaveLength(2);
    expect(analysis.clipped).toEqual([false, false]);
    // A -23 dBFS stereo sine is -23 LUFS: the -0.691 offset cancels the
    // K-weighting gain at 1 kHz, which is the calibration BS.1770-5 states.
    expect(analysis.integrated).toBeGreaterThan(-23.1);
    expect(analysis.integrated).toBeLessThan(-22.9);
    expect(analysis.duration).toBeCloseTo(4, 9);
  });

  it("runs the analyzeAudioBuffer block", async () => {
    const channels = tone(1, -20);
    // Only what the adapter reads. A real `AudioBuffer` is a browser type and
    // this suite has no browser - which is the point of taking `Float32Array[]`
    // in the core and keeping the adapter four lines wide.
    const buffer = {
      sampleRate: SAMPLE_RATE,
      numberOfChannels: 2,
      getChannelData: (c: number) => channels[c],
    } as unknown as AudioBuffer;

    // --- README ---
    const analysis = await analyzeAudioBuffer(buffer, { loudness: true });
    // --- end ---

    expect(analysis.channelCount).toBe(2);
    expect(analysis.peak[0]).toBeCloseTo(-20, 2);
    expect(analysis.momentary).toBeGreaterThan(-20.1);
  });

  it("runs the onProgress block", async () => {
    const channels = tone(1, -23);
    const sampleRate = SAMPLE_RATE;
    const bar = { value: 0 };

    // --- README ---
    await analyze(channels, sampleRate, {
      truePeak: true,
      onProgress: (fraction) => (bar.value = fraction),
    });
    // --- end ---

    expect(bar.value).toBe(1);
  });

  it("runs the gainToTarget block", () => {
    // --- README ---
    gainToTarget(-23, -14); // 9 - dB to apply
    // --- end ---
    expect(gainToTarget(-23, -14)).toBe(9);
  });

  // The README's claim, and the reason the delivery table is worth having.
  it("moves a measured programme onto a target", async () => {
    const before = await analyze(tone(4, -20), SAMPLE_RATE, { loudness: true });
    const db = gainToTarget(before.integrated, -14);
    const factor = Math.pow(10, db / 20);
    const after = await analyze(
      tone(4, -20).map((c) => Float32Array.from(c, (x) => x * factor)),
      SAMPLE_RATE,
      { loudness: true },
    );
    expect(after.integrated).toBeCloseTo(-14, 2);
  });
});

describe("README: build your own", () => {
  it("converts dB to a bar length and a label", () => {
    // `dbToUnit(db, minDb, maxDb)` clamped to [0, 1], `-Infinity` is 0;
    // `formatDb(-Infinity)` is "-∞" with a real minus sign.
    expect(dbToUnit(-30, -60, 0)).toBeCloseTo(0.5, 12);
    expect(dbToUnit(-Infinity, -60, 0)).toBe(0);
    expect(dbToUnit(6, -60, 0)).toBe(1);
    expect(formatDb(-Infinity)).toBe("−∞");
    expect(formatDb(-12.34, 1)).toBe("−12.3");
  });

  it("takes the LevelMeterUI options the README lists", async () => {
    // --- README ---
    const ui = new LevelMeterUI({ orientation: "vertical" });
    // --- end ---
    expect(ui.orientation).toBe("vertical");
    expect(new LevelMeterUI({ minDb: -60, maxDb: 6 }).maxDb).toBe(6);
  });
});

describe("README: transport", () => {
  it("says which transport is running, without needing headers", async () => {
    const { meter } = await tapped();
    // No `crossOriginIsolated` in node, so this is the un-isolated path - the
    // one the README says needs no COOP or COEP.
    expect(meter.transport).toBe("message");
    meter.dispose();
  });
});
