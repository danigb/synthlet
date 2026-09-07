import { createWorkletTestContext } from "./test-utils";

describe("ProcessorNode", () => {
  let Processor: any;
  const sampleRate = 40;

  beforeAll(async () => {
    createWorkletTestContext(sampleRate);
    Processor = (await import("./worklet")).SvfProcessor;
  });

  it("registers processor", () => {
    expect(global.registerProcessor).toHaveBeenCalledWith(
      "SvfProcessor",
      Processor,
    );
  });

  it("has parameter descriptors", () => {
    expect(Processor.parameterDescriptors).toMatchSnapshot();
  });

  // A low pass well under Nyquist at this sample rate, so an impulse leaves a
  // ring long enough to compare channel against channel.
  const params = { type: [1], frequency: [5], Q: [4] };
  const impulse = () => {
    const signal = new Float32Array(16);
    signal[0] = 1;
    return signal;
  };

  it("processes every channel, not just the first", () => {
    const [left, right] = runProcessChannels(
      new Processor(),
      [impulse(), impulse()],
      params,
    );
    // The right channel used to come out silent.
    expect(Array.from(left).some((value) => value !== 0)).toBe(true);
    expect(Array.from(right)).toEqual(Array.from(left));
  });

  it("filters the left channel exactly as it would filter it alone", () => {
    const [mono] = runProcessChannels(new Processor(), [impulse()], params);
    const [left] = runProcessChannels(
      new Processor(),
      [impulse(), impulse()],
      params,
    );
    expect(Array.from(left)).toEqual(Array.from(mono));
  });

  it("gives each channel its own state, so a hard pan stays panned", () => {
    const node = new Processor();
    // The impulse only ever enters the left channel; the right must stay
    // silent across blocks, not pick up the left channel's ringing.
    const first = runProcessChannels(
      node,
      [impulse(), new Float32Array(16)],
      params,
    );
    expect(Array.from(first[0]).some((value) => value !== 0)).toBe(true);
    expect(first[1]).toEqual(new Float32Array(16));

    const second = runProcessChannels(
      node,
      [new Float32Array(16), new Float32Array(16)],
      params,
    );
    expect(Array.from(second[0]).some((value) => value !== 0)).toBe(true);
    expect(second[1]).toEqual(new Float32Array(16));
  });

  it("stops running after DISPOSE", () => {
    const processor = new Processor();
    const outputs = [[new Float32Array(16)]];
    // `true` first, so a regression here fails for the right reason.
    expect(processor.process([[impulse()]], outputs, params)).toBe(true);
    processor.port.onmessage({ data: { type: "DISPOSE" } });
    expect(processor.process([[impulse()]], outputs, params)).toBe(false);
  });
});

type Worklet = {
  process: (
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: any,
  ) => boolean;
};

// Runs one block with a multi-channel input and an output of the same shape,
// the way Web Audio allocates it when no outputChannelCount is declared.
function runProcessChannels(
  worklet: Worklet,
  input: Float32Array[],
  params: any = {},
) {
  const outputs = [input.map((channel) => new Float32Array(channel.length))];
  worklet.process([input], outputs, params);
  return outputs[0];
}
