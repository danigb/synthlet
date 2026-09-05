import { createWorkletTestContext, runProcessMono } from "./test-utils";

describe("WavetableOscillatorWorkletNode", () => {
  let WavetableOscillatorWorkletProcessor: any;
  const sampleRate = 40;

  beforeAll(async () => {
    createWorkletTestContext(sampleRate);
    WavetableOscillatorWorkletProcessor = (await import("./worklet"))
      .WavetableOscillatorWorkletProcessor;
  });

  it("registers processor", () => {
    expect(global.registerProcessor).toHaveBeenCalledWith(
      "WavetableOscillatorWorkletProcessor",
      WavetableOscillatorWorkletProcessor,
    );
  });

  it("has parameter descriptors", () => {
    expect(
      WavetableOscillatorWorkletProcessor.parameterDescriptors,
    ).toMatchSnapshot();
  });

  it("renders the table it is sent, and stops when disposed", () => {
    // The one line nothing exercised: `process()` handing `parameters` - which
    // arrive as arrays, not numbers - straight to `agen`. The DSP itself is
    // measured in `dsp.test.ts`; this is about the wiring around it.
    const processor = new WavetableOscillatorWorkletProcessor();
    const wavetable = Float32Array.from({ length: 10 }, (_, i) => i / 10);
    processor.port.onmessage({
      data: { type: "WAVETABLE", wavetable, length: 10 },
    });

    // sampleRate / len = 4 Hz is this table's natural pitch, so a frequency of
    // 4 is one table sample per output sample.
    const params = {
      frequency: [4],
      morph: [0],
    };
    expect(Array.from(runProcessMono(processor, 10, params))).toEqual(
      Array.from(wavetable),
    );

    expect(processor.process([], [[new Float32Array(10)]], params)).toBe(true);
    processor.port.onmessage({ data: { type: "DISPOSE" } });
    expect(processor.process([], [[new Float32Array(10)]], params)).toBe(false);
  });
});
