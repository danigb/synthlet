// The processor reads `sampleRate` and `currentFrame` at render time, so both
// are installed on the global before the module is imported.
const SAMPLE_RATE = 44100;
const BLOCK = 128;

describe("TimestretchAudioSourceProcessor", () => {
  let Worklet: any;

  beforeAll(async () => {
    createWorkletTestContext(SAMPLE_RATE);
    Worklet = (await import("./worklet")).TimestretchAudioSourceProcessor;
  });

  beforeEach(() => {
    (global as any).currentFrame = 0;
  });

  /** A k-rate parameter block, with every param at its default. */
  const withParams = (over: Record<string, number> = {}) => {
    const values: Record<string, number> = {
      playbackRate: 1,
      detune: 0,
      startOffset: 0,
      endOffset: 0,
      reverse: 0,
      loop: 0,
      ...over,
    };
    const block: Record<string, Float32Array> = {};
    for (const name of Object.keys(values)) {
      block[name] = new Float32Array([values[name]]);
    }
    return block;
  };

  const params = withParams();

  const sine = (length: number, frequency: number) =>
    Float32Array.from({ length }, (_, i) =>
      Math.sin((2 * Math.PI * frequency * i) / SAMPLE_RATE),
    );

  const create = (options?: any) => {
    const node = new Worklet(options);
    node.port.postMessage.mockClear?.();
    return node;
  };

  const send = (node: any, message: any) =>
    node.port.onmessage({ data: message });

  /** Render `blocks` quanta, advancing `currentFrame` as the host would. */
  function run(node: any, blocks: number, channels = 1, over = params) {
    const rendered: Float32Array[] = [];
    for (let b = 0; b < blocks; b++) {
      const output = Array.from(
        { length: channels },
        () => new Float32Array(BLOCK),
      );
      node.process([[]], [output], over);
      rendered.push(output[0]);
      (global as any).currentFrame += BLOCK;
    }
    const joined = new Float32Array(blocks * BLOCK);
    rendered.forEach((block, i) => joined.set(block, i * BLOCK));
    return joined;
  }

  const messagesOfType = (node: any, type: string) =>
    node.port.postMessage.mock.calls.filter((c: any[]) => c[0]?.type === type);

  it("registers the processor", () => {
    expect(global.registerProcessor).toHaveBeenCalledWith(
      "TimestretchAudioSourceProcessor",
      Worklet,
    );
  });

  it("has parameter descriptors", () => {
    expect(Worklet.parameterDescriptors).toMatchSnapshot();
  });

  it("is silent with no buffer", () => {
    const output = run(create(), 2);
    expect(Array.from(output)).toEqual(new Array(2 * BLOCK).fill(0));
  });

  it("is silent with a buffer but no start", () => {
    const node = create();
    send(node, { type: "SET_BUFFER", channels: [sine(20000, 440)] });
    const output = run(node, 2);
    expect(Array.from(output)).toEqual(new Array(2 * BLOCK).fill(0));
  });

  it("starts immediately on when = 0", () => {
    const input = sine(20000, 440);
    const node = create();
    send(node, { type: "SET_BUFFER", channels: [input] });
    send(node, { type: "START", when: 0 });

    const output = run(node, 2);
    // Criterion 3, end to end: sample 0 out is sample 0 in.
    for (let i = 0; i < 64; i++) {
      expect(output[i]).toBeCloseTo(input[i], 5);
    }
  });

  it("starts on the sample `when` asks for, not the block boundary", () => {
    const input = sine(20000, 440);
    const node = create();
    const EDGE = 200; // mid-way through the second block
    send(node, { type: "SET_BUFFER", channels: [input] });
    send(node, { type: "START", when: EDGE / SAMPLE_RATE });

    const output = run(node, 3);
    expect(Array.from(output.subarray(0, EDGE))).toEqual(
      new Array(EDGE).fill(0),
    );
    for (let i = 0; i < 32; i++) {
      expect(output[EDGE + i]).toBeCloseTo(input[i], 5);
    }
  });

  it("plays from `startOffset`", () => {
    const input = sine(30000, 440);
    const node = create();
    send(node, { type: "SET_BUFFER", channels: [input] });
    send(node, { type: "START", when: 0 });

    const output = run(
      node,
      1,
      1,
      withParams({
        startOffset: 10000 / SAMPLE_RATE,
      }),
    );
    for (let i = 0; i < 64; i++) {
      expect(output[i]).toBeCloseTo(input[10000 + i], 5);
    }
  });

  it("posts ENDED exactly once at the natural end", () => {
    const node = create();
    send(node, { type: "SET_BUFFER", channels: [sine(4000, 300)] });
    send(node, { type: "START", when: 0 });

    run(node, 80);
    expect(messagesOfType(node, "ENDED")).toHaveLength(1);
  });

  it("posts ENDED once when stopped early, and falls silent", () => {
    const node = create();
    send(node, { type: "SET_BUFFER", channels: [sine(40000, 300)] });
    send(node, { type: "START", when: 0 });
    run(node, 2);

    const stopFrame = (global as any).currentFrame + 64;
    send(node, { type: "STOP", when: stopFrame / SAMPLE_RATE });
    const output = run(node, 3);

    expect(messagesOfType(node, "ENDED")).toHaveLength(1);
    // Everything from the stop offset onwards is silence.
    expect(Array.from(output.subarray(64))).toEqual(
      new Array(output.length - 64).fill(0),
    );
  });

  it("honours `endOffset`", () => {
    const node = create();
    send(node, { type: "SET_BUFFER", channels: [sine(40000, 300)] });
    send(node, { type: "START", when: 0 });

    run(node, 200, 1, withParams({ endOffset: 4000 / SAMPLE_RATE }));
    expect(messagesOfType(node, "ENDED")).toHaveLength(1);
  });

  it("plays backwards on `reverse`", () => {
    const input = Float32Array.from({ length: 20000 }, (_, i) => i / 20000);
    const node = create();
    send(node, { type: "SET_BUFFER", channels: [input] });
    send(node, { type: "START", when: 0 });

    const output = run(node, 1, 1, withParams({ reverse: 1 }));
    for (let i = 0; i < 64; i++) {
      expect(output[i]).toBeCloseTo(input[19999 - i], 5);
    }
  });

  it("never posts ENDED while `loop` is on", () => {
    const node = create();
    send(node, { type: "SET_BUFFER", channels: [sine(4000, 300)] });
    send(node, { type: "START", when: 0 });

    // Long past the clip's own 4000 samples, so a one-shot would have ended.
    run(node, 200, 1, withParams({ loop: 1 }));
    expect(messagesOfType(node, "ENDED")).toHaveLength(0);
  });

  it("posts ENDED for a start with nothing to play", () => {
    // An offset past the end of the buffer leaves the kernel refusing to
    // start. Without an ENDED the main thread's `playing` latch never clears
    // and every later start() throws for the life of the node.
    const node = create();
    send(node, { type: "SET_BUFFER", channels: [sine(4000, 300)] });
    send(node, { type: "START", when: 0 });

    // One second into a clip that lasts 0.09 of one.
    const output = run(node, 4, 1, withParams({ startOffset: 1 }));
    expect(messagesOfType(node, "ENDED")).toHaveLength(1);
    expect(Array.from(output)).toEqual(new Array(output.length).fill(0));
  });

  it("restarts after it has ended", () => {
    const input = sine(4000, 300);
    const node = create();
    send(node, { type: "SET_BUFFER", channels: [input] });

    send(node, { type: "START", when: 0 });
    const first = run(node, 60);
    expect(messagesOfType(node, "ENDED")).toHaveLength(1);

    send(node, {
      type: "START",
      when: (global as any).currentFrame / SAMPLE_RATE,
    });
    const second = run(node, 60);

    expect(messagesOfType(node, "ENDED")).toHaveLength(2);
    expect(Array.from(second)).toEqual(Array.from(first));
  });

  it("fans a mono buffer out to both output channels", () => {
    const node = create();
    send(node, { type: "SET_BUFFER", channels: [sine(20000, 440)] });
    send(node, { type: "START", when: 0 });

    const output = [new Float32Array(BLOCK), new Float32Array(BLOCK)];
    node.process([[]], [output], params);
    expect(Array.from(output[1])).toEqual(Array.from(output[0]));
  });

  it("keeps a hard-panned stereo buffer panned", () => {
    const node = create();
    send(node, {
      type: "SET_BUFFER",
      channels: [sine(20000, 440), new Float32Array(20000)],
    });
    send(node, { type: "START", when: 0 });

    const output = [new Float32Array(BLOCK), new Float32Array(BLOCK)];
    node.process([[]], [output], params);
    expect(Math.max(...Array.from(output[0]).map(Math.abs))).toBeGreaterThan(
      0.1,
    );
    expect(Array.from(output[1])).toEqual(new Array(BLOCK).fill(0));
  });

  it("takes its engine geometry from processorOptions", () => {
    const node = create({
      processorOptions: { frameMs: 50, overlap: 0.25, searchRate: 8000 },
    });
    send(node, { type: "SET_BUFFER", channels: [sine(20000, 440)] });
    send(node, { type: "START", when: 0 });
    // A different geometry must still render, and still start on sample 0.
    const output = run(node, 2);
    expect(Math.max(...Array.from(output).map(Math.abs))).toBeGreaterThan(0.5);
  });

  it("stops running on DISPOSE", () => {
    const node = create();
    expect(node.process([[]], [[new Float32Array(BLOCK)]], params)).toBe(true);
    send(node, { type: "DISPOSE" });
    expect(node.process([[]], [[new Float32Array(BLOCK)]], params)).toBe(false);
  });
});

function createWorkletTestContext(rate: number, ctx: any = global) {
  ctx.sampleRate = rate;
  ctx.currentFrame = 0;
  ctx.registerProcessor = jest.fn();
  ctx.AudioWorkletProcessor = class AudioWorkletNodeStub {
    port: { postMessage: jest.Mock; onmessage: (event: any) => void };

    constructor() {
      this.port = {
        postMessage: jest.fn(),
        onmessage: () => {},
      };
    }
  };
}

// This file declares helpers at the top level: make it a module so they don't
// collide with the identically named helpers in sibling packages.
export {};
