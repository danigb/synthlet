// The processor reads `sampleRate` and `currentFrame` at render time, so both
// are installed on the global before the module is imported.
const SAMPLE_RATE = 44100;
const BLOCK = 128;

describe("FlexAudioBufferSourceProcessor", () => {
  let Worklet: any;

  beforeAll(async () => {
    createWorkletTestContext(SAMPLE_RATE);
    Worklet = (await import("./worklet")).FlexAudioBufferSourceProcessor;
  });

  beforeEach(() => {
    (global as any).currentFrame = 0;
  });

  const params = {
    playbackRate: new Float32Array([1]),
    detune: new Float32Array([0]),
  };

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
      "FlexAudioBufferSourceProcessor",
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
    send(node, { type: "START", when: 0, offset: 0, duration: 0 });

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
    send(node, {
      type: "START",
      when: EDGE / SAMPLE_RATE,
      offset: 0,
      duration: 0,
    });

    const output = run(node, 3);
    expect(Array.from(output.subarray(0, EDGE))).toEqual(
      new Array(EDGE).fill(0),
    );
    for (let i = 0; i < 32; i++) {
      expect(output[EDGE + i]).toBeCloseTo(input[i], 5);
    }
  });

  it("plays from `offset`", () => {
    const input = sine(30000, 440);
    const node = create();
    send(node, { type: "SET_BUFFER", channels: [input] });
    send(node, {
      type: "START",
      when: 0,
      offset: 10000 / SAMPLE_RATE,
      duration: 0,
    });

    const output = run(node, 1);
    for (let i = 0; i < 64; i++) {
      expect(output[i]).toBeCloseTo(input[10000 + i], 5);
    }
  });

  it("posts ENDED exactly once at the natural end", () => {
    const node = create();
    send(node, { type: "SET_BUFFER", channels: [sine(4000, 300)] });
    send(node, { type: "START", when: 0, offset: 0, duration: 0 });

    run(node, 80);
    expect(messagesOfType(node, "ENDED")).toHaveLength(1);
  });

  it("posts ENDED once when stopped early, and falls silent", () => {
    const node = create();
    send(node, { type: "SET_BUFFER", channels: [sine(40000, 300)] });
    send(node, { type: "START", when: 0, offset: 0, duration: 0 });
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

  it("honours `duration`", () => {
    const node = create();
    send(node, { type: "SET_BUFFER", channels: [sine(40000, 300)] });
    send(node, {
      type: "START",
      when: 0,
      offset: 0,
      duration: 4000 / SAMPLE_RATE,
    });

    run(node, 200);
    expect(messagesOfType(node, "ENDED")).toHaveLength(1);
  });

  it("posts ENDED for a start with nothing to play", () => {
    // An offset past the end of the buffer leaves the kernel refusing to
    // start. Without an ENDED the main thread's `playing` latch never clears
    // and every later start() throws for the life of the node.
    const node = create();
    send(node, { type: "SET_BUFFER", channels: [sine(4000, 300)] });
    // One second into a clip that lasts 0.09 of one.
    send(node, { type: "START", when: 0, offset: 1, duration: 0 });

    const output = run(node, 4);
    expect(messagesOfType(node, "ENDED")).toHaveLength(1);
    expect(Array.from(output)).toEqual(new Array(output.length).fill(0));
  });

  it("restarts after it has ended", () => {
    const input = sine(4000, 300);
    const node = create();
    send(node, { type: "SET_BUFFER", channels: [input] });

    send(node, { type: "START", when: 0, offset: 0, duration: 0 });
    const first = run(node, 60);
    expect(messagesOfType(node, "ENDED")).toHaveLength(1);

    send(node, {
      type: "START",
      when: (global as any).currentFrame / SAMPLE_RATE,
      offset: 0,
      duration: 0,
    });
    const second = run(node, 60);

    expect(messagesOfType(node, "ENDED")).toHaveLength(2);
    expect(Array.from(second)).toEqual(Array.from(first));
  });

  it("fans a mono buffer out to both output channels", () => {
    const node = create();
    send(node, { type: "SET_BUFFER", channels: [sine(20000, 440)] });
    send(node, { type: "START", when: 0, offset: 0, duration: 0 });

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
    send(node, { type: "START", when: 0, offset: 0, duration: 0 });

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
    send(node, { type: "START", when: 0, offset: 0, duration: 0 });
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
