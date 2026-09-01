describe("AdWorkletNode", () => {
  let AdWorklet: any;

  beforeAll(async () => {
    createWorkletTestContext();
    AdWorklet = (await import("./worklet")).AdProcessor;
  });

  it("registers processor", () => {
    expect(global.registerProcessor).toHaveBeenCalledWith(
      "AdProcessor",
      AdWorklet,
    );
  });

  it("is generates offset when not triggered", () => {
    const node = new AdWorklet();
    const params = {
      trigger: [0],
      attack: [0.01],
      decay: [0.1],
      offset: [100],
      gain: [0.5],
    };
    let output = runProcessMono(node, 10, params);
    expect(output).toEqual(new Float32Array(10).fill(100));
  });

  it("generates an envelope with gain", () => {
    const node = new AdWorklet();
    const params = {
      trigger: [1],
      attack: [0.5],
      decay: [0.5],
      offset: [100],
      gain: [50],
    };
    let output = runProcessMono(node, 10, params);
    // sampleRate is 10 here, so `attack: 0.5` peaks on sample 4 (0.5 s) and
    // `decay: 0.5` runs from sample 5 to silence on sample 9. offset 100 and
    // gain 50 put the envelope's 0...1 on 100...150.
    expect(Array.from(output)).toEqual([
      130.39862060546875, 142.5005340576172, 147.31838989257812,
      149.23641967773438, 150, 112.55943298339844, 103.15478515625,
      100.79244995117188, 100.19905090332031, 100.05000305175781,
    ]);
  });

  it("has parameter descriptors", () => {
    expect(AdWorklet.parameterDescriptors).toMatchSnapshot();
  });

  describe("modulator mode", () => {
    const params = {
      trigger: [1],
      attack: [0.5],
      decay: [0.5],
      offset: [0],
      gain: [1],
    };
    const modulator = () =>
      new AdWorklet({ processorOptions: { mode: "modulator" } });

    it("multiplies a constant 1 input by the generator's envelope", () => {
      const expected = runProcessMono(new AdWorklet(), 10, params);
      const output = runProcessWithInput(
        modulator(),
        new Float32Array(10).fill(1),
        params,
      );
      expect(Array.from(output)).toEqual(Array.from(expected));
    });

    it("is silent for a 0 input", () => {
      const output = runProcessWithInput(
        modulator(),
        new Float32Array(10),
        params,
      );
      expect(output).toEqual(new Float32Array(10));
    });

    it("applies gain and offset to the product, like adsr", () => {
      const loud = { ...params, offset: [100], gain: [50] };
      const expected = runProcessMono(new AdWorklet(), 10, loud);
      const output = runProcessWithInput(
        modulator(),
        new Float32Array(10).fill(1),
        loud,
      );
      expect(Array.from(output)).toEqual(Array.from(expected));
    });

    it("treats an unconnected input as silence", () => {
      const node = modulator();
      const outputs = [[new Float32Array(10)]];
      expect(() => node.process([[]], outputs, params)).not.toThrow();
      expect(outputs[0][0]).toEqual(new Float32Array(10));
    });

    it("processes every channel, not just the first", () => {
      const envelope = Array.from(runProcessMono(new AdWorklet(), 10, params));
      const [left, right] = runProcessChannels(
        modulator(),
        [new Float32Array(10).fill(1), new Float32Array(10).fill(0.5)],
        params,
      );
      // Both channels get the same envelope, each scaled by its own input:
      // the right channel used to come out silent.
      expect(Array.from(left)).toEqual(envelope);
      expect(Array.from(right)).toEqual(envelope.map((v) => v * 0.5));
    });

    it("keeps a hard-panned input panned", () => {
      const [left, right] = runProcessChannels(
        modulator(),
        [new Float32Array(10).fill(1), new Float32Array(10)],
        params,
      );
      expect(Array.from(left).some((v) => v > 0)).toBe(true);
      expect(right).toEqual(new Float32Array(10));
    });

    it("writes the offset to every channel of an unconnected input", () => {
      const node = modulator();
      const outputs = [[new Float32Array(10), new Float32Array(10)]];
      node.process([[]], outputs, { ...params, offset: [100] });
      expect(outputs[0][0]).toEqual(new Float32Array(10).fill(100));
      expect(outputs[0][1]).toEqual(new Float32Array(10).fill(100));
    });
  });

  // The AD's `attack` and `decay` are seconds: attack is the time to the peak,
  // decay the time from the peak to silence (-60 dB). Same definitions as
  // @synthlet/adsr. These run at a real sample rate - the processor reads the
  // global `sampleRate` when it is constructed - so the numbers below are the
  // contract stated in seconds rather than in regenerated literals.
  describe("timing, in seconds", () => {
    const SAMPLE_RATE = 44100;
    const SECONDS = [0.01, 0.1, 0.5, 1, 2, 10];

    // Constructs a processor at SAMPLE_RATE and restores the file's fixture.
    const atFullRate = () => {
      // @ts-ignore
      global.sampleRate = SAMPLE_RATE;
      const node = new AdWorklet();
      // @ts-ignore
      global.sampleRate = 10;
      return node;
    };

    it.each(SECONDS)("peaks at `attack` seconds (attack: %p)", (attack) => {
      const expected = Math.round(attack * SAMPLE_RATE);
      const output = runProcessMono(atFullRate(), expected + 8, {
        trigger: [1],
        attack: [attack],
        decay: [10],
        offset: [0],
        gain: [1],
      });

      // The peak is the first sample that reaches 1: attack is over there and
      // the decay starts on the next one.
      const peak = output.indexOf(1);
      expect(peak).toBeGreaterThan(-1);
      // Linear in `attack`: doubling the parameter doubles this index.
      expect(Math.abs(peak + 1 - expected)).toBeLessThanOrEqual(1);
    });

    it.each(SECONDS)("is silent after `decay` seconds (decay: %p)", (decay) => {
      const expected = Math.round(decay * SAMPLE_RATE);
      const output = runProcessMono(atFullRate(), expected + 8, {
        trigger: [1],
        attack: [0],
        decay: [decay],
        offset: [0],
        gain: [1],
      });

      // With a zero-length attack the peak is sample 0, so the decay runs from
      // sample 1 and the first zero is `decay` seconds after the peak.
      const peak = output.indexOf(1);
      const silent = output.indexOf(0, peak + 1);
      expect(peak).toBe(0);
      expect(silent).toBeGreaterThan(-1);
      expect(Math.abs(silent - peak - expected)).toBeLessThanOrEqual(1);
    });
  });

  describe("zero-length stages", () => {
    const params = {
      trigger: [1],
      attack: [0],
      decay: [0],
      offset: [0],
      gain: [1],
    };

    it("peaks for one sample, then is silent, without NaN", () => {
      const output = runProcessMono(new AdWorklet(), 10, params);
      expect(Array.from(output).every(Number.isFinite)).toBe(true);
      // Zero attack snaps to the peak; zero decay drops to 0 the next sample.
      expect(Array.from(output)).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    });

    it("a zero attack still decays over `decay` seconds", () => {
      const output = runProcessMono(new AdWorklet(), 10, {
        ...params,
        decay: [0.5], // 5 samples at the fixture's sampleRate of 10
      });
      expect(Array.from(output).every(Number.isFinite)).toBe(true);
      expect(output[0]).toBe(1);
      // -60 dB lands exactly on sample 5 here, so rounding decides whether the
      // hard-zero happens on it or the next one.
      expect(Math.abs(output.indexOf(0) - 5)).toBeLessThanOrEqual(1);
    });
  });

  describe("generator mode", () => {
    it("writes the same envelope to every output channel", () => {
      const params = {
        trigger: [1],
        attack: [0.5],
        decay: [0.5],
        offset: [0],
        gain: [1],
      };
      const outputs = [[new Float32Array(10), new Float32Array(10)]];
      new AdWorklet().process([[]], outputs, params);
      expect(outputs[0][1]).toEqual(outputs[0][0]);
    });
  });
});

function createWorkletTestContext(sampleRate = 10) {
  // @ts-ignore
  global.sampleRate = sampleRate;
  // @ts-ignore
  global.AudioWorkletProcessor = class AudioWorkletNodeStub {
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
  // @ts-ignore
  global.registerProcessor = jest.fn(); // Mock registerProcessor
}

function createInputsOutputs(
  options: { ins?: number; outs?: number; length?: number } = {},
) {
  const inCount = options.ins ?? 1;
  const outCount = options.outs ?? 1;
  const length = options.length ?? 10;
  const inputs: Float32Array[][] = [];
  const outputs: Float32Array[][] = [];

  for (let i = 0; i < inCount; i++) {
    inputs.push([new Float32Array(length)]);
  }
  for (let i = 0; i < outCount; i++) {
    outputs.push([new Float32Array(length)]);
  }
  return { inputs, outputs };
}

type Worklet = {
  process: (
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: any,
  ) => boolean;
};

export function runProcessMono(
  worklet: Worklet,
  size: number,
  params: any = {},
) {
  const { inputs, outputs } = createInputsOutputs({ length: size });
  worklet.process(inputs, outputs, params);
  return outputs[0][0];
}

export function runProcessWithInput(
  worklet: Worklet,
  input: Float32Array,
  params: any = {},
) {
  const outputs = [[new Float32Array(input.length)]];
  worklet.process([[input]], outputs, params);
  return outputs[0][0];
}

// Runs one block with a multi-channel input and an output of the same shape,
// the way Web Audio allocates it when no outputChannelCount is declared.
export function runProcessChannels(
  worklet: Worklet,
  input: Float32Array[],
  params: any = {},
) {
  const outputs = [input.map((channel) => new Float32Array(channel.length))];
  worklet.process([input], outputs, params);
  return outputs[0];
}
