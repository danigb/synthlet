describe("LookaheadLimiterProcessor", () => {
  let Worklet: any;

  beforeAll(async () => {
    createWorkletTestContext(48000);
    Worklet = (await import("./worklet")).LookaheadLimiterProcessor;
  });

  it("registers processor", () => {
    expect(global.registerProcessor).toHaveBeenCalledWith(
      "LookaheadLimiterProcessor",
      Worklet,
    );
  });

  it("has parameter descriptors", () => {
    expect(Worklet.parameterDescriptors).toMatchSnapshot();
  });

  it("survives a block with no input channels", () => {
    // An unconnected input arrives as `[[]]`. The limiter still has to render
    // the block - it has a delay line to flush - so this must not throw and
    // must not leave the output untouched garbage.
    const processor = new Worklet({ processorOptions: { lookahead: 2 } });
    const outputs = [[new Float32Array(128)]];

    const running = processor.process([[]], outputs, params());

    expect(running).toBe(true);
    expect(Array.from(outputs[0][0])).toEqual(
      Array.from(new Float32Array(128)),
    );
  });

  it("limits a hot block down to the threshold", () => {
    const processor = new Worklet({ processorOptions: { lookahead: 0.5 } });
    const input = Float32Array.from({ length: 128 }, () => 1);
    const outputs = [[new Float32Array(128)]];

    // Two blocks: the first fills the delay line, the second is the signal.
    processor.process([[input]], outputs, params());
    processor.process([[input]], outputs, params());

    const peak = Math.max(...Array.from(outputs[0][0], Math.abs));
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThanOrEqual(Math.pow(10, -1 / 20));
  });

  // Ticket 17: the gain reduction readout, over the shared levels transport.
  describe("the gain reduction meter", () => {
    const metered = (options: object = {}) =>
      new Worklet({
        processorOptions: { lookahead: 0.5, meter: true, ...options },
      });

    const hot = () => Float32Array.from({ length: 128 }, () => 1);

    it("writes the header the reader checks", () => {
      const processor = metered();
      expect(processor.v[0]).toBe(1); // layout version
      expect(processor.v[1]).toBe(1); // one slot
      expect(processor.v).toHaveLength(4);
    });

    // Success criterion 1, against the DSP's own number rather than a
    // reimplementation of it: `gainOut` is the gain the limiter actually
    // applied, sample by sample.
    it("reports 20*log10 of the smallest gain in the block", () => {
      const processor = metered();
      const outputs = [[new Float32Array(128)]];

      processor.process([[hot()]], outputs, params());
      processor.process([[hot()]], outputs, params());

      const applied: Float32Array = processor.g.subarray(0, 128);
      const min = Math.min(...Array.from(applied));
      expect(min).toBeLessThan(1); // it really did reduce
      // `Math.fround` because the slot is a Float32: exact equality against the
      // DSP's own number, once it has been through the view it travels in.
      expect(processor.v[3]).toBe(Math.fround(20 * Math.log10(min)));
    });

    it("reads 0 dB while the limiter is not working", () => {
      const processor = metered();
      const quiet = new Float32Array(128).fill(0.01);
      const outputs = [[new Float32Array(128)]];

      processor.process([[quiet]], outputs, params());
      processor.process([[quiet]], outputs, params());

      expect(processor.v[3]).toBe(0);
    });

    it("posts at the interval, not every block", () => {
      // 16 ms at 48 kHz is six 128-frame blocks.
      const processor = metered({ postIntervalMs: 16 });
      const outputs = [[new Float32Array(128)]];
      for (let i = 0; i < 6; i++)
        processor.process([[hot()]], outputs, params());

      expect(processor.port.postMessage).toHaveBeenCalledTimes(1);
      expect(processor.port.postMessage).toHaveBeenCalledWith(processor.v);
    });

    it("posts nothing when the buffer is shared", () => {
      const buffer = new ArrayBuffer(4 * 4);
      const processor = metered({ levelsBuffer: buffer });
      const outputs = [[new Float32Array(128)]];
      for (let i = 0; i < 20; i++)
        processor.process([[hot()]], outputs, params());

      expect(processor.port.postMessage).not.toHaveBeenCalled();
      // Written straight into the memory the reader already sees.
      expect(new Float32Array(buffer)[3]).toBeLessThan(0);
    });

    // Success criterion 2.
    it("neither writes nor posts with the meter off", () => {
      const processor = new Worklet({
        processorOptions: { lookahead: 0.5 },
      });
      const outputs = [[new Float32Array(128)]];
      for (let i = 0; i < 20; i++)
        processor.process([[hot()]], outputs, params());

      expect(processor.v).toBeUndefined();
      expect(processor.g).toBeUndefined();
      expect(processor.port.postMessage).not.toHaveBeenCalled();
    });

    it("still limits identically with the meter on", () => {
      const outputs = (n: number) => [[new Float32Array(n)]];
      const off = new Worklet({ processorOptions: { lookahead: 0.5 } });
      const on = metered();
      const a = outputs(128);
      const b = outputs(128);

      for (let i = 0; i < 4; i++) {
        off.process([[hot()]], a, params());
        on.process([[hot()]], b, params());
      }

      expect(Array.from(b[0][0])).toEqual(Array.from(a[0][0]));
    });
  });

  it("stops running once disposed", () => {
    const processor = new Worklet({});
    processor.port.onmessage({ data: { type: "DISPOSE" } });

    expect(processor.process([[]], [[new Float32Array(128)]], params())).toBe(
      false,
    );
  });
});

const params = () => ({
  threshold: new Float32Array([-1]),
  release: new Float32Array([168]),
  gain: new Float32Array([0]),
});

function createWorkletTestContext(sampleRate = 10, ctx: any = global) {
  ctx.sampleRate = sampleRate;
  ctx.registerProcessor = jest.fn();
  ctx.AudioWorkletProcessor = class AudioWorkletNodeStub {
    port: {
      postMessage: jest.Mock<any, any, any>;
      onmessage: jest.Mock<any, any, any>;
    };

    constructor() {
      this.port = {
        postMessage: jest.fn(),
        onmessage: jest.fn(),
      };
    }
  };
}

// This file declares helpers at the top level: make it a module so they don't
// collide with the identically named helpers in sibling packages.
export {};
