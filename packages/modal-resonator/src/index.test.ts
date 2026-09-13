import { FIELDS } from "./dsp";
import { ModalResonator } from "./index";
import { kettleDrum, harmonic, MODES } from "./modes";
import { PARAMS } from "./params";

/**
 * The node, not the DSP: what the factory hands the processor, and what
 * `setModes` puts on the port.
 *
 * The mock is `wavetable-oscillator/src/index.test.ts`'s: enough for
 * `createWorkletConstructor` to build a node and for its messages and options
 * to be read back. Kept local so the package stays dependency-free.
 */

class ParamMock {
  value = 0;
}

class AudioNodeMock {
  connect = jest.fn();
  disconnect = jest.fn();
}

class AudioWorkletNodeMock extends AudioNodeMock {
  readonly port = { postMessage: jest.fn(), onmessage: null as any };
  readonly parameters: { get(name: string): ParamMock };

  constructor(
    public context: any,
    public processorName: string,
    public options: any,
  ) {
    super();
    const params = new Map<string, ParamMock>();
    this.parameters = {
      get(name) {
        let param = params.get(name);
        if (!param) {
          param = new ParamMock();
          params.set(name, param);
        }
        return param;
      },
    };
  }
}

const context = { sampleRate: 44100, currentTime: 0 } as AudioContext;
const created = (node: unknown) => node as unknown as AudioWorkletNodeMock;

const modesMessages = (node: AudioWorkletNodeMock) =>
  node.port.postMessage.mock.calls.filter(
    ([message]) => message?.type === "MODES",
  );

beforeAll(() => {
  (global as any).AudioNode = AudioNodeMock;
  (global as any).AudioWorkletNode = AudioWorkletNodeMock;
});

let warn: jest.SpyInstance;
beforeEach(() => {
  warn = jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
});

describe("ModalResonator", () => {
  it("is one input summed to one mono output", () => {
    const node = created(ModalResonator(context));
    expect(node.processorName).toBe("ModalResonatorProcessor");
    expect(node.options.numberOfInputs).toBe(1);
    expect(node.options.numberOfOutputs).toBe(1);
    expect(node.options.outputChannelCount).toEqual([1]);
  });

  it("defaults the pool to 32 and posts no table of its own", () => {
    // The processor starts on harmonic(8) by itself, so construction sends
    // nothing and a node sounds from its first block.
    const node = ModalResonator(context);
    expect(node.maxModes).toBe(32);
    expect(created(node).options.processorOptions).toEqual({
      maxModes: 32,
      modes: undefined,
    });
    expect(modesMessages(created(node))).toHaveLength(0);
  });

  it("hands maxModes and the construction table to the processor", () => {
    const node = created(
      ModalResonator(context, { maxModes: 64, modes: kettleDrum() }),
    );
    const { maxModes, modes } = node.options.processorOptions;
    expect(maxModes).toBe(64);
    expect(Array.from(modes)).toEqual(
      kettleDrum().flatMap((m) => [m.ratio, m.level, m.decay]),
    );
  });

  it("clamps maxModes to 1...256", () => {
    expect(ModalResonator(context, { maxModes: 1000 }).maxModes).toBe(256);
    expect(ModalResonator(context, { maxModes: 0 }).maxModes).toBe(32);
    expect(ModalResonator(context, { maxModes: 7.9 }).maxModes).toBe(7);
  });

  it("posts a table with setModes, transferred", () => {
    const node = ModalResonator(context);
    node.setModes(kettleDrum());
    const [[message, transfer]] = modesMessages(created(node));
    expect(message.count).toBe(4);
    expect(message.modes).toBeInstanceOf(Float64Array);
    expect(message.modes.length).toBe(4 * FIELDS);
    expect(transfer).toEqual([message.modes.buffer]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("truncates a table longer than the pool, with one warning", () => {
    const node = ModalResonator(context, { maxModes: 32 });
    node.setModes(harmonic(40));
    const [[message]] = modesMessages(created(node));
    expect(message.count).toBe(32);
    expect(message.modes.length).toBe(32 * FIELDS);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/40 modes.*maxModes is 32/);
  });

  it("warns the same way for a construction table that does not fit", () => {
    const node = created(
      ModalResonator(context, { maxModes: 4, modes: harmonic(8) }),
    );
    expect(node.options.processorOptions.modes.length).toBe(4 * FIELDS);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("wires its parameters like any other module", () => {
    const node = created(
      ModalResonator(context, { frequency: 150, decay: 2, brightness: 0.5 }),
    );
    expect(node.parameters.get("frequency").value).toBe(150);
    expect(node.parameters.get("decay").value).toBe(2);
    expect(node.parameters.get("brightness").value).toBe(0.5);
  });

  it("carries its descriptors and its tables", () => {
    expect(ModalResonator.descriptors).toBe(PARAMS);
    expect(ModalResonator.modes).toBe(MODES);
    expect(ModalResonator.modes.kettleDrum).toBe(kettleDrum);
  });
});
