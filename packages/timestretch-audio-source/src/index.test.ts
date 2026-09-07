import { TimestretchAudioSource } from "./index";
import { PARAMS } from "./params";

// A minimal node-level mock: enough for createWorkletConstructor to build the
// node. Kept local so the package stays dependency-free.
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
const context = { sampleRate: SAMPLE_RATE, currentTime: 10 } as AudioContext;
const created = (node: unknown) => node as unknown as AudioWorkletNodeMock;

/** An AudioBuffer stand-in whose channel data is observably shared. */
function audioBuffer(length: number, numberOfChannels = 1, rate = SAMPLE_RATE) {
  const data = Array.from({ length: numberOfChannels }, (_, c) =>
    Float32Array.from({ length }, (_, i) => Math.sin(i / 10) * (c + 1)),
  );
  return {
    length,
    numberOfChannels,
    sampleRate: rate,
    duration: length / rate,
    getChannelData: (c: number) => data[c],
    __data: data,
  } as unknown as AudioBuffer & { __data: Float32Array[] };
}

const lastMessage = (node: AudioWorkletNodeMock, type: string) =>
  node.port.postMessage.mock.calls
    .map((call) => call[0])
    .filter((message) => message?.type === type)
    .pop();

beforeAll(() => {
  (global as any).AudioNode = AudioNodeMock;
  (global as any).AudioWorkletNode = AudioWorkletNodeMock;
});

describe("TimestretchAudioSource", () => {
  it("is a no-input source with a stereo output by default", () => {
    const { options, processorName } = created(TimestretchAudioSource(context));
    expect(processorName).toBe("TimestretchAudioSourceProcessor");
    expect(options.numberOfInputs).toBe(0);
    expect(options.numberOfOutputs).toBe(1);
    expect(options.outputChannelCount).toEqual([2]);
  });

  it("takes its output width from channelCount", () => {
    const { options } = created(
      TimestretchAudioSource(context, { channelCount: 1 }),
    );
    expect(options.outputChannelCount).toEqual([1]);
  });

  it("passes the engine geometry as processorOptions, with defaults", () => {
    const { options } = created(TimestretchAudioSource(context));
    expect(options.processorOptions).toEqual({
      frameMs: 30,
      overlap: 0.5,
      tolerance: 0.25,
      searchRate: 12000,
    });
  });

  it("lets the geometry be overridden", () => {
    const { options } = created(
      TimestretchAudioSource(context, { frameMs: 50, searchRate: 8000 }),
    );
    expect(options.processorOptions).toMatchObject({
      frameMs: 50,
      searchRate: 8000,
      overlap: 0.5,
    });
  });

  it("exposes its parameter descriptors", () => {
    expect(TimestretchAudioSource.descriptors).toBe(PARAMS);
    expect(TimestretchAudioSource.descriptors.map((d) => d.name)).toEqual([
      "playbackRate",
      "detune",
      "startOffset",
      "endOffset",
      "reverse",
      "loop",
    ]);
  });

  describe("setBuffer", () => {
    it("posts the channel data", () => {
      const source = TimestretchAudioSource(context);
      source.setBuffer(audioBuffer(1000, 2));

      const message = lastMessage(created(source), "SET_BUFFER");
      expect(message.channels).toHaveLength(2);
      expect(message.channels[0]).toHaveLength(1000);
    });

    it("does not detach the caller's AudioBuffer", () => {
      // `getChannelData` returns the live array; transferring it would leave
      // the caller holding a detached buffer.
      const buffer = audioBuffer(1000, 1);
      const before = Array.from(buffer.__data[0].subarray(0, 8));

      TimestretchAudioSource(context).setBuffer(buffer);

      expect(buffer.__data[0]).toHaveLength(1000);
      expect(Array.from(buffer.__data[0].subarray(0, 8))).toEqual(before);
    });

    it("transfers the copy it posts, so nothing is cloned", () => {
      const source = TimestretchAudioSource(context);
      source.setBuffer(audioBuffer(1000, 2));

      const [message, transfer] =
        created(source).port.postMessage.mock.calls.at(-1)!;
      expect(transfer).toHaveLength(2);
      // `toBeInstanceOf` is unreliable here: the module and the test file get
      // different `ArrayBuffer` constructors under ts-jest.
      expect(transfer[0].constructor.name).toBe("ArrayBuffer");
      expect(transfer[0]).toBe(message.channels[0].buffer);
    });

    it("accepts raw channel data as well as an AudioBuffer", () => {
      const source = TimestretchAudioSource(context);
      source.setBuffer({
        channels: [new Float32Array(500)],
        sampleRate: SAMPLE_RATE,
      });
      expect(
        lastMessage(created(source), "SET_BUFFER").channels[0],
      ).toHaveLength(500);
      expect(source.naturalDuration).toBeCloseTo(500 / SAMPLE_RATE, 6);
    });

    it("resamples a mismatched rate at load time", () => {
      const source = TimestretchAudioSource(context);
      // 48 kHz into a 44.1 kHz context: shorter by the rate ratio.
      source.setBuffer(audioBuffer(48000, 1, 48000));

      const message = lastMessage(created(source), "SET_BUFFER");
      expect(message.channels[0].length).toBe(44100);
      expect(source.naturalDuration).toBeCloseTo(1, 3);
    });

    it("leaves a matching rate alone", () => {
      const source = TimestretchAudioSource(context);
      source.setBuffer(audioBuffer(4410, 1, SAMPLE_RATE));
      expect(
        lastMessage(created(source), "SET_BUFFER").channels[0],
      ).toHaveLength(4410);
    });
  });

  describe("scheduling", () => {
    const started = () => {
      const source = TimestretchAudioSource(context);
      source.setBuffer(audioBuffer(44100, 1));
      return source;
    };

    it("posts START with seconds, and writes the region to the params", () => {
      const source = started();
      source.start(12, 0.5, 2);
      expect(lastMessage(created(source), "START")).toEqual({
        type: "START",
        when: 12,
      });
      expect(source.startOffset.value).toBe(0.5);
      expect(source.endOffset.value).toBe(2.5);
    });

    it("leaves the region alone when start() is given no region", () => {
      // `start(when)` must not clobber offsets the caller set deliberately -
      // which is the whole reason the arguments are optional rather than
      // defaulted to zero.
      const source = started();
      source.startOffset.value = 1;
      source.endOffset.value = 3;
      source.start(12);
      expect(source.startOffset.value).toBe(1);
      expect(source.endOffset.value).toBe(3);
    });

    it("takes `duration` from the region start when only it is given", () => {
      const source = started();
      source.startOffset.value = 1;
      source.start(0, undefined, 2);
      expect(source.startOffset.value).toBe(1);
      expect(source.endOffset.value).toBe(3);
    });

    it("resolves `when` 0 to the context's current time", () => {
      const source = started();
      source.start();
      expect(lastMessage(created(source), "START").when).toBe(
        context.currentTime,
      );
    });

    it("throws when started twice", () => {
      const source = started();
      source.start();
      expect(() => source.start()).toThrow(/already playing/);
    });

    it("throws when there is no buffer", () => {
      expect(() => TimestretchAudioSource(context).start()).toThrow(
        /no buffer/,
      );
    });

    it("can be restarted once it has ended", () => {
      const source = started();
      source.start();
      created(source).port.onmessage({ data: { type: "ENDED" } });
      expect(() => source.start()).not.toThrow();
    });

    it("can be started again straight after stop()", () => {
      // The guard must not wait on ENDED coming back from the audio thread:
      // that is a render quantum away at best, and never arrives at all on a
      // suspended context. The error message says to stop() and start again,
      // so doing exactly that has to work.
      const source = started();
      source.start();
      source.stop();
      expect(() => source.start()).not.toThrow();
    });

    it("calls onended when the processor reports it", () => {
      const source = started();
      const ended = jest.fn();
      source.onended = ended;
      source.start();

      created(source).port.onmessage({ data: { type: "ENDED" } });
      expect(ended).toHaveBeenCalledTimes(1);
    });

    it("ignores messages that are not ENDED", () => {
      const source = started();
      const ended = jest.fn();
      source.onended = ended;
      created(source).port.onmessage({ data: { type: "SOMETHING" } });
      expect(ended).not.toHaveBeenCalled();
    });

    it("posts STOP", () => {
      const source = started();
      source.start();
      source.stop(20);
      expect(lastMessage(created(source), "STOP")).toEqual({
        type: "STOP",
        when: 20,
      });
    });
  });

  describe("setDuration", () => {
    const oneSecond = () => {
      const source = TimestretchAudioSource(context);
      source.setBuffer(audioBuffer(SAMPLE_RATE, 1));
      return source;
    };

    it("reports the natural duration", () => {
      expect(oneSecond().naturalDuration).toBeCloseTo(1, 6);
    });

    it("reports the region duration, resolving the endOffset sentinel", () => {
      const source = oneSecond();
      // endOffset 0 means "the end of the buffer", so the region starts out
      // being the whole clip.
      expect(source.regionDuration).toBeCloseTo(1, 6);
      source.startOffset.value = 0.25;
      expect(source.regionDuration).toBeCloseTo(0.75, 6);
      source.endOffset.value = 0.5;
      expect(source.regionDuration).toBeCloseTo(0.25, 6);
    });

    it("sets playbackRate to regionDuration / seconds", () => {
      const source = oneSecond();
      source.setDuration(2);
      expect(source.playbackRate.value).toBeCloseTo(0.5, 6);
      source.setDuration(0.25);
      expect(source.playbackRate.value).toBeCloseTo(4, 6);
    });

    it("divides the region, not the whole clip", () => {
      const source = oneSecond();
      source.startOffset.value = 0.5;
      source.setDuration(1);
      expect(source.playbackRate.value).toBeCloseTo(0.5, 6);
    });

    it("ignores a non-positive duration rather than dividing by zero", () => {
      const source = oneSecond();
      source.playbackRate.value = 1;
      source.setDuration(0);
      source.setDuration(-1);
      expect(source.playbackRate.value).toBe(1);
    });

    it("does nothing without a buffer", () => {
      const source = TimestretchAudioSource(context);
      expect(source.naturalDuration).toBe(0);
      source.setDuration(2);
      expect(source.playbackRate.value).toBe(0);
    });
  });

  it("posts DISPOSE and disconnects on dispose", () => {
    const source = TimestretchAudioSource(context);
    source.dispose();
    expect(created(source).disconnect).toHaveBeenCalled();
    expect(lastMessage(created(source), "DISPOSE")).toEqual({
      type: "DISPOSE",
    });
  });
});
