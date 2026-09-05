import { peak, peakFrequency } from "./_spectrum";
import { buildPlane, WavetableOscillator } from "./index";
import { normalizePeak } from "./wavetable-builder";
import { WavetableOscillator as WavetableOscillatorUnit } from "./wavetable-oscillator";

/**
 * The node, not the DSP: what `postCreate` wires up, and the promise this ticket
 * exists to keep — a `WavetableOscillator` makes a sound the moment it is
 * constructed, with no network of any kind.
 *
 * The mock is the one `flex-audio-buffer-source/src/index.test.ts` established:
 * enough for `createWorkletConstructor` to build a node and for the messages it
 * posts to be read back. Kept local so the package stays dependency-free.
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

const SAMPLE_RATE = 44100;
const context = { sampleRate: SAMPLE_RATE, currentTime: 0 } as AudioContext;
const created = (node: unknown) => node as unknown as AudioWorkletNodeMock;

const wavetableMessages = (node: AudioWorkletNodeMock) =>
  node.port.postMessage.mock.calls
    .map((call) => call[0])
    .filter((message) => message?.type === "WAVETABLE");

/** Renders `length` samples from a posted table through the DSP unit. */
function render(
  message: { wavetable: Float32Array; length: number; levels?: number },
  frequency: number,
  length: number,
) {
  const osc = WavetableOscillatorUnit(SAMPLE_RATE);
  osc.set(message.wavetable, message.length, message.levels);
  const out = new Float32Array(length);
  const block = new Float32Array(128);
  const inputs = { frequency: [frequency], morph: [0] };
  for (let at = 0; at < length; at += 128) {
    const size = Math.min(128, length - at);
    const view = size === 128 ? block : block.subarray(0, size);
    osc.agen(view, inputs);
    out.set(view, at);
  }
  return out;
}

let fetchCalls = 0;

beforeAll(() => {
  (global as any).AudioNode = AudioNodeMock;
  (global as any).AudioWorkletNode = AudioWorkletNodeMock;
  // Not a stub that returns something plausible: the point of the ticket is that
  // no code path here reaches the network at all, so anything touching `fetch`
  // has to fail loudly.
  (global as any).fetch = () => {
    fetchCalls++;
    throw Error("fetch is not available");
  };
});

beforeEach(() => {
  fetchCalls = 0;
});

describe("WavetableOscillator", () => {
  it("posts a table on construction, without a network", () => {
    const node = created(WavetableOscillator(context));
    const messages = wavetableMessages(node);

    expect(messages).toHaveLength(1);
    expect(messages[0].length).toBe(256);
    // Four planes, eight mip levels, level-major: the band-limiting is built
    // here at load, on the main thread, and never in the worklet.
    expect(messages[0].levels).toBe(8);
    expect(messages[0].wavetable.length).toBe(8 * 4 * 256);
    expect(fetchCalls).toBe(0);
  });

  it("transfers the table rather than cloning it", () => {
    // `flex-audio-buffer-source/src/index.ts:145-153`'s idiom: 32 KB for the
    // built-in set and 512 KB for a 64-plane one is past the point where a
    // structured clone per node is free. The copy before the transfer is not
    // ceremony - `defaultWavetable` memoizes one instance and shares it, and
    // transferring that buffer would leave the next node with an empty table.
    const node = created(WavetableOscillator(context));
    const [message, transfer] = node.port.postMessage.mock.calls[0];
    expect(transfer).toEqual([message.wavetable.buffer]);

    const second = created(WavetableOscillator(context));
    const other = second.port.postMessage.mock.calls[0][0];
    expect(other.wavetable.length).toBe(8 * 4 * 256);
    expect(other.wavetable).not.toBe(message.wavetable);
    expect(peak(other.wavetable)).toBeCloseTo(1, 6);
  });

  it("makes a sound in its first render quantum", () => {
    // Success criterion 1. Before this ticket the first quantum - and every
    // quantum until a fetch from smpldsnds.github.io resolved - was exactly
    // zero.
    const node = created(WavetableOscillator(context));
    const quantum = render(wavetableMessages(node)[0], 440, 128);

    expect(peak(quantum)).toBeGreaterThan(0.5);
    expect(quantum.some((sample) => sample !== 0)).toBe(true);
    for (const sample of quantum) expect(Number.isFinite(sample)).toBe(true);
  });

  it("plays the default table at the pitch it is asked for", () => {
    // The other half of criterion 1: audible *and* correct-pitch. 32768 samples
    // at 44.1 kHz, the same analysis size `dsp.test.ts` uses, measured on the
    // sawtooth plane of the built-in table.
    const node = created(WavetableOscillator(context));
    const { wavetable, length } = wavetableMessages(node)[0];
    const sawtoothPlane = {
      wavetable: wavetable.slice(2 * length, 3 * length),
      length,
    };
    const measured = peakFrequency(render(sawtoothPlane, 440, 32768), 44100);
    expect(Math.abs(1200 * Math.log2(measured / 440))).toBeLessThan(5);
  });

  it("builds and posts a table from harmonics", () => {
    const node = created(WavetableOscillator(context));
    (node as any).setHarmonics([[1], [1, 0.5, 0.25]]);

    const messages = wavetableMessages(node);
    expect(messages).toHaveLength(2);

    const { wavetable, length, levels } = messages[1];
    expect(length).toBe(256);
    expect(levels).toBe(8);
    expect(wavetable.length).toBe(8 * 2 * 256);

    const sine = buildPlane([1], 256);
    normalizePeak(sine);
    expect(Array.from(wavetable.subarray(0, 256))).toEqual(Array.from(sine));
    expect(fetchCalls).toBe(0);
  });

  it("takes a table length on setHarmonics", () => {
    const node = created(WavetableOscillator(context));
    (node as any).setHarmonics([[1, 0.5]], 64);

    const { wavetable, length, levels } = wavetableMessages(node)[1];
    expect(length).toBe(64);
    // A 64-sample table holds 32 harmonics, so its pyramid is six levels deep.
    expect(levels).toBe(6);
    expect(wavetable.length).toBe(6 * 64);
  });

  it("is a no-input source with one output", () => {
    const { options, processorName } = created(WavetableOscillator(context));
    expect(processorName).toBe("WavetableOscillatorWorkletProcessor");
    expect(options.numberOfInputs).toBe(0);
    expect(options.numberOfOutputs).toBe(1);
  });
});
