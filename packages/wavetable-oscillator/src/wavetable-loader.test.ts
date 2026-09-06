import {
  decodeWav,
  decodeWavetable,
  fetchWavetable,
  toCatalog,
  WAVEDIT_BASE_URL,
  waveditCatalog,
  WavetableCatalog,
} from "./wavetable-loader";

/**
 * The loader, against a file of every shape it can be handed.
 *
 * The audit drove the previous decoder — fixed offsets, format at byte 20,
 * samples from 44 — with generated files of each common WAV variant and found
 * that **four of them came back as wrong samples with no exception raised**:
 * a `LIST` chunk before `data` made it read metadata as audio, `fact` made it
 * return 2 samples out of 8, 32-bit integer PCM was read with `getFloat32`, and
 * 24-bit came back as a different waveform at a different amplitude. That table
 * is this file's spine: every row of it is a test, and every row asserts the
 * decoded values against the input rather than merely "does not throw".
 *
 * The files are **generated here rather than committed as fixtures**. A fixture
 * would put the interesting part — which byte says what — in a binary nobody
 * reads, and the whole point of the failure it is testing for is that the bytes
 * were not where the code thought.
 *
 * Nothing touches the network. `fetch` is stubbed per test, following
 * `index.test.ts`'s rule that anything reaching it unexpectedly fails loudly.
 */

// --- a WAV writer -----------------------------------------------------------

const PCM = 1;
const IEEE_FLOAT = 3;

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

/** One chunk: a 4-byte id, a little-endian size, the body, and a pad byte. */
function chunk(id: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + body.length + (body.length % 2));
  out.set(ascii(id), 0);
  new DataView(out.buffer).setUint32(4, body.length, true);
  out.set(body, 8);
  return out;
}

type WavOptions = {
  tag?: number;
  bits?: number;
  channels?: number;
  sampleRate?: number;
  /** Extra chunks written between `fmt ` and `data`. */
  before?: [string, Uint8Array][];
  /** Write the `fmt ` chunk as `WAVE_FORMAT_EXTENSIBLE` around `tag`. */
  extensible?: boolean;
  /** Cut the file short after assembling it, to make a truncated download. */
  truncateTo?: number;
  /** Leave the `fmt ` or the `data` chunk out entirely. */
  omit?: "fmt " | "data";
};

function fmtChunk(options: WavOptions): Uint8Array {
  const {
    tag = PCM,
    bits = 16,
    channels = 1,
    sampleRate = 44100,
    extensible,
  } = options;
  const body = new Uint8Array(extensible ? 40 : 16);
  const view = new DataView(body.buffer);
  view.setUint16(0, extensible ? 0xfffe : tag, true);
  view.setUint16(2, channels, true);
  view.setUint32(4, sampleRate, true);
  view.setUint32(8, (sampleRate * channels * bits) / 8, true);
  view.setUint16(12, (channels * bits) / 8, true);
  view.setUint16(14, bits, true);
  if (extensible) {
    view.setUint16(16, 22, true); // cbSize
    view.setUint16(18, bits, true); // valid bits per sample
    view.setUint32(20, channels === 1 ? 0x4 : 0x3, true); // channel mask
    view.setUint16(24, tag, true); // the GUID's first field is the real tag
    body.set(
      [
        0x00, 0x00, 0x00, 0x00, 0x10, 0x00, 0x80, 0x00, 0x00, 0xaa, 0x00, 0x38,
        0x9b, 0x71,
      ],
      26,
    );
  }
  return chunk("fmt ", body);
}

function encode(samples: number[], tag: number, bits: number): Uint8Array {
  const width = bits / 8;
  const body = new Uint8Array(samples.length * width);
  const view = new DataView(body.buffer);
  samples.forEach((x, i) => {
    const at = i * width;
    if (tag === IEEE_FLOAT) {
      if (bits === 64) view.setFloat64(at, x, true);
      else view.setFloat32(at, x, true);
    } else if (bits === 8) {
      view.setUint8(at, Math.round(x * 128) + 128);
    } else if (bits === 16) {
      view.setInt16(at, Math.round(x * 32767), true);
    } else if (bits === 24) {
      const n = Math.round(x * 8388607);
      view.setUint8(at, n & 0xff);
      view.setUint8(at + 1, (n >> 8) & 0xff);
      view.setUint8(at + 2, (n >> 16) & 0xff);
    } else if (bits === 32) {
      view.setInt32(at, Math.round(x * 2147483647), true);
    } else if (bits === 12) {
      view.setUint16(at, 0, true); // an unsupported depth, written as zeros
    }
  });
  return body;
}

function wav(samples: number[], options: WavOptions = {}): ArrayBuffer {
  const { tag = PCM, bits = 16, before = [], omit } = options;
  const parts: Uint8Array[] = [];
  if (omit !== "fmt ") parts.push(fmtChunk(options));
  for (const [id, body] of before) parts.push(chunk(id, body));
  if (omit !== "data") parts.push(chunk("data", encode(samples, tag, bits)));

  let size = 4;
  for (const part of parts) size += part.length;
  const out = new Uint8Array(8 + size);
  out.set(ascii("RIFF"), 0);
  new DataView(out.buffer).setUint32(4, size, true);
  out.set(ascii("WAVE"), 8);
  let at = 12;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return options.truncateTo === undefined
    ? out.buffer
    : out.slice(0, options.truncateTo).buffer;
}

// --- the signal every case carries ------------------------------------------

/** Eight samples of a half-amplitude sine: the audit's own probe. */
const SIGNAL = Array.from({ length: 8 }, (_, i) =>
  Number(((Math.sin((2 * Math.PI * i) / 8) * 1) / 2).toFixed(6)),
);

const values = (data: Float32Array) => Array.from(data);

/**
 * Decoded values against the known input, to within one quantization step of
 * the depth under test. Explicit rather than `toBeCloseTo`, whose argument is
 * decimal places and a quantization step is not.
 */
const closeTo = (data: Float32Array, want: number[], step: number) => {
  expect(data.length).toBe(want.length);
  // A 32-bit int sample is finer than the `Float32Array` it lands in, so the
  // tolerance never goes below a Float32 ulp near 1.
  const tolerance = Math.max(step, 1.2e-7);
  want.forEach((x, i) =>
    expect(Math.abs(data[i] - x)).toBeLessThanOrEqual(tolerance),
  );
};

describe("decodeWav", () => {
  it("decodes canonical 16-bit PCM mono", () => {
    const { data, channels, sampleRate } = decodeWav(wav(SIGNAL));
    expect(channels).toBe(1);
    expect(sampleRate).toBe(44100);
    closeTo(data, SIGNAL, 1 / 32768);
  });

  it("decodes 8-bit PCM, which is unsigned and centred at 128", () => {
    // The row the old decoder answered with "Offset is outside the bounds of
    // the DataView" - it read every sample as 16 bits and walked off the end.
    const { data } = decodeWav(wav(SIGNAL, { bits: 8 }));
    closeTo(data, SIGNAL, 1 / 128);
  });

  it("decodes 24-bit PCM", () => {
    // The old decoder returned `0, 0.5096, 0, 0.5096, ...` here: a different
    // waveform at a different amplitude, silently.
    const { data } = decodeWav(wav(SIGNAL, { bits: 24 }));
    closeTo(data, SIGNAL, 1 / 8388608);
  });

  it("decodes 32-bit integer PCM as an integer, not as a float", () => {
    // The row that produced `2.0` and `-409686835200`: `isFloat = bits === 32`
    // sat after the `format !== 1` guard, so it could only be true for integer
    // PCM, which it then read with `getFloat32`.
    const { data } = decodeWav(wav(SIGNAL, { bits: 32 }));
    closeTo(data, SIGNAL, 1 / 2147483648);
  });

  it("keeps a loud 32-bit integer sample finite", () => {
    // Worse than wrong: any |x| >= 0.99609375 encodes to an int32 whose
    // exponent bits are all one, and `getFloat32` reads that as NaN. One of
    // those in a fetched table poisons every sample the oscillator produces.
    const loud = [0.999, -0.999, 1, -1];
    const { data } = decodeWav(wav(loud, { bits: 32 }));
    for (const x of data) expect(Number.isFinite(x)).toBe(true);
    closeTo(data, loud, 1e-6);

    const asFloat = new DataView(wav(loud, { bits: 32 })).getFloat32(44, true);
    expect(Number.isNaN(asFloat)).toBe(true);
  });

  it("decodes 32-bit IEEE float, which used to be rejected outright", () => {
    // "Invalid format. Only PCM supported." - thrown at the one format the
    // float branch was written for.
    const { data } = decodeWav(wav(SIGNAL, { tag: IEEE_FLOAT, bits: 32 }));
    closeTo(data, SIGNAL, 1e-7);
  });

  it("decodes 64-bit IEEE float, narrowed to Float32", () => {
    const { data } = decodeWav(wav(SIGNAL, { tag: IEEE_FLOAT, bits: 64 }));
    closeTo(data, SIGNAL, 1e-7);
  });

  it("reads the real format out of a WAVE_FORMAT_EXTENSIBLE header", () => {
    // What a DAW very often writes instead of a bare tag 1 or 3.
    const pcm = decodeWav(wav(SIGNAL, { extensible: true }));
    closeTo(pcm.data, SIGNAL, 1 / 32768);

    const float = decodeWav(
      wav(SIGNAL, { tag: IEEE_FLOAT, bits: 32, extensible: true }),
    );
    closeTo(float.data, SIGNAL, 1e-7);
  });

  it("keeps stereo samples interleaved and reports the channel count", () => {
    const stereo = decodeWav(
      wav([1, -1, 0.5, -0.5], { channels: 2, bits: 32, tag: IEEE_FLOAT }),
    );
    expect(stereo.channels).toBe(2);
    expect(values(stereo.data)).toEqual([1, -1, 0.5, -0.5]);
  });
});

describe("the chunk walker", () => {
  const plain = decodeWav(wav(SIGNAL));

  it("skips a LIST chunk before data", () => {
    // 6 samples of metadata read as audio, before.
    const listed = wav(SIGNAL, {
      before: [["LIST", new Uint8Array(ascii("INFOISFTsynthlet"))]],
    });
    expect(values(decodeWav(listed).data)).toEqual(values(plain.data));
  });

  it("skips a fact chunk before data", () => {
    // 2 samples out of 8, before. `fact` is *required by spec* for every
    // non-PCM format, so this is not an exotic file.
    const facted = wav(SIGNAL, { before: [["fact", new Uint8Array(4)]] });
    expect(values(decodeWav(facted).data)).toEqual(values(plain.data));
  });

  it("skips both together, and an unknown chunk with them", () => {
    const both = wav(SIGNAL, {
      before: [
        ["fact", new Uint8Array(4)],
        ["LIST", new Uint8Array(ascii("INFOICRDsynthlet"))],
        ["cue ", new Uint8Array(4)],
      ],
    });
    expect(values(decodeWav(both).data)).toEqual(values(plain.data));
  });

  it("honours the pad byte after an odd-sized chunk", () => {
    // The rule the old code had no equivalent of: a chunk is padded to an even
    // length and the pad byte is not counted in its size. Miss it and the walk
    // lands one byte into the next id, which reads audio as a chunk header.
    const odd = wav(SIGNAL, {
      before: [["LIST", new Uint8Array(ascii("INFOISFTodd"))]], // 11 bytes
    });
    expect(values(decodeWav(odd).data)).toEqual(values(plain.data));
  });

  it("finds fmt after data", () => {
    // Legal, and impossible to read at a fixed offset.
    const bytes = new Uint8Array(wav(SIGNAL));
    const fmt = bytes.slice(12, 36);
    const data = bytes.slice(36);
    const out = new Uint8Array(bytes.length);
    out.set(bytes.slice(0, 12), 0);
    out.set(data, 12);
    out.set(fmt, 12 + data.length);
    expect(values(decodeWav(out.buffer).data)).toEqual(values(plain.data));
  });
});

describe("decodeWav failures", () => {
  const message = (buffer: ArrayBuffer) => {
    try {
      decodeWav(buffer);
    } catch (error) {
      return (error as Error).message;
    }
    return "did not throw";
  };

  it("names what it found instead of RIFF", () => {
    const bytes = new Uint8Array(wav(SIGNAL));
    bytes.set(ascii("ID3 "), 0);
    expect(message(bytes.buffer)).toContain(`found "ID3 "`);
  });

  it("names what it found instead of WAVE", () => {
    const bytes = new Uint8Array(wav(SIGNAL));
    bytes.set(ascii("AVI "), 8);
    expect(message(bytes.buffer)).toContain(`found "AVI "`);
  });

  it("rejects a buffer too short to hold a header", () => {
    expect(message(new ArrayBuffer(4))).toContain("too short");
  });

  it("names a missing fmt chunk", () => {
    expect(message(wav(SIGNAL, { omit: "fmt " }))).toContain(`no "fmt " chunk`);
  });

  it("names a missing data chunk", () => {
    expect(message(wav(SIGNAL, { omit: "data" }))).toContain(`no "data" chunk`);
  });

  it("names a truncated download rather than reading off the end", () => {
    const text = message(wav(SIGNAL, { truncateTo: 50 }));
    expect(text).toContain("Truncated");
    expect(text).toContain("16 bytes"); // declared
    expect(text).toContain("6 are present");
  });

  it("names a short fmt chunk", () => {
    const bytes = new Uint8Array(wav(SIGNAL));
    new DataView(bytes.buffer).setUint32(16, 12, true); // fmt size 16 -> 12
    expect(message(bytes.buffer)).toContain("12 bytes, expected at least 16");
  });

  it("names a short extensible fmt chunk", () => {
    // 0xFFFE with a 16-byte body: there is no GUID to read the real tag from.
    const bytes = new Uint8Array(wav(SIGNAL));
    new DataView(bytes.buffer).setUint16(20, 0xfffe, true);
    expect(message(bytes.buffer)).toContain("expected at least 40");
  });

  it("names an unsupported format tag", () => {
    const text = message(wav(SIGNAL, { tag: 6 })); // A-law
    expect(text).toContain("6 (A-law)");
    expect(text).toContain("Supported:");
  });

  it("names an unsupported format tag it has no name for", () => {
    expect(message(wav(SIGNAL, { tag: 999 }))).toContain("format 999");
  });

  it("names an unsupported bit depth", () => {
    expect(message(wav(SIGNAL, { bits: 12 }))).toContain("12 bits per sample");
  });
});

describe("decodeWavetable", () => {
  /** 3 planes of 4 samples: small enough to write out in full. */
  const three = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => n / 32);

  it("returns the planes and the length", () => {
    const table = decodeWavetable(wav(three, { tag: IEEE_FLOAT, bits: 32 }), 4);
    expect(table.length).toBe(4);
    expect(values(table.data)).toEqual(three);
    // Raw: no `levels`, because decoding does not condition or mipmap. That is
    // `setWavetable`'s job and it stays there.
    expect(table.levels).toBeUndefined();
  });

  it("rejects stereo with the channel count in the message", () => {
    expect(() => decodeWavetable(wav(three, { channels: 2 }), 4)).toThrow(
      /has 2 channels/,
    );
  });

  it("rejects 3 channels with the channel count in the message", () => {
    expect(() => decodeWavetable(wav(three, { channels: 3 }), 4)).toThrow(
      /has 3 channels/,
    );
  });

  it("rejects a sample count that does not divide by the frame length", () => {
    // The audit's open question, as an assertion: 12 samples read as 256-sample
    // frames used to give a table whose every plane boundary and every pitch
    // was wrong, silently.
    expect(() => decodeWavetable(wav(three), 5)).toThrow(
      /12 samples, which is not a whole number of 5-sample frames/,
    );
  });

  it("rejects an empty data chunk", () => {
    expect(() => decodeWavetable(wav([]), 4)).toThrow(/no samples/);
  });

  it("rejects a nonsense frame length", () => {
    expect(() => decodeWavetable(wav(three), 0)).toThrow(/integer >= 2/);
    expect(() => decodeWavetable(wav(three), 2.5)).toThrow(/integer >= 2/);
  });
});

describe("the catalog", () => {
  it("defaults to the wavedit mirror", () => {
    expect(toCatalog().url("synlp10")).toBe(`${WAVEDIT_BASE_URL}/SYNLP10.WAV`);
  });

  it("takes a base URL as shorthand, with or without a trailing slash", () => {
    expect(toCatalog("/tables").url("a")).toBe("/tables/A.WAV");
    expect(toCatalog("https://x.dev/t/").url("a")).toBe(
      "https://x.dev/t/A.WAV",
    );
  });

  it("passes anything already addressable straight through", () => {
    // So a table served from your own origin needs no catalog at all.
    const catalog = waveditCatalog("/tables");
    for (const url of [
      "https://x.dev/a.wav",
      "http://x.dev/a.wav",
      "/local/a.wav",
      "./a.wav",
      "blob:abc",
      "data:audio/wav;base64,UklGRg==",
    ]) {
      expect(catalog.url(url)).toBe(url);
    }
  });

  it("takes a whole catalog object unchanged", () => {
    const own: WavetableCatalog = {
      url: (name) => `bundled://${name}`,
      names: async () => ["one"],
    };
    expect(toCatalog(own)).toBe(own);
    expect(toCatalog(own).url("a")).toBe("bundled://a");
  });
});

// --- the network paths, with `fetch` stubbed --------------------------------

type Status = { ok?: boolean; status?: number; statusText?: string };

const respond = (body: ArrayBuffer | object, init: Status = {}) =>
  jest.fn(async () => ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? "OK",
    arrayBuffer: async () => body as ArrayBuffer,
    json: async () => body,
  }));

describe("fetchWavetable", () => {
  afterEach(() => {
    delete (global as any).fetch;
  });

  it("fetches and decodes", async () => {
    const fetchMock = respond(wav([0.25, -0.25, 0.5, -0.5]));
    (global as any).fetch = fetchMock;

    const table = await fetchWavetable("https://x.dev/a.wav", 2);
    expect(fetchMock).toHaveBeenCalledWith("https://x.dev/a.wav");
    expect(table.length).toBe(2);
    closeTo(table.data, [0.25, -0.25, 0.5, -0.5], 1 / 32768);
  });

  it("rejects a non-200 with the status in the message", async () => {
    (global as any).fetch = respond(new ArrayBuffer(0), {
      ok: false,
      status: 404,
      statusText: "Not Found",
    });
    await expect(fetchWavetable("https://x.dev/a.wav", 2)).rejects.toThrow(
      /404 Not Found/,
    );
  });

  it("rejects rather than throwing synchronously on a bad file", async () => {
    // The distinction matters: a caller writing `.catch()` has to receive
    // everything, including the decode failures.
    (global as any).fetch = respond(wav([1, 2, 3], { channels: 2 }));
    await expect(fetchWavetable("https://x.dev/a.wav", 2)).rejects.toThrow(
      /2 channels/,
    );
  });
});

describe("waveditCatalog().names", () => {
  afterEach(() => {
    delete (global as any).fetch;
  });

  it("fetches files.json next to the samples", async () => {
    const fetchMock = respond(["A", "B"]);
    (global as any).fetch = fetchMock;

    await expect(waveditCatalog("/tables").names()).resolves.toEqual([
      "A",
      "B",
    ]);
    expect(fetchMock).toHaveBeenCalledWith("/tables/files.json");
  });

  it("rejects a non-200", async () => {
    (global as any).fetch = respond([], {
      ok: false,
      status: 500,
      statusText: "Server Error",
    });
    await expect(waveditCatalog().names()).rejects.toThrow(/500 Server Error/);
  });

  it("rejects a 200 that is not a list of names", async () => {
    // A misconfigured static host answers a missing path with an HTML page and
    // a 200, so `res.ok` is not enough to trust the body.
    (global as any).fetch = respond({ error: "not found" });
    await expect(waveditCatalog().names()).rejects.toThrow(/JSON array/);

    (global as any).fetch = respond([1, 2]);
    await expect(waveditCatalog().names()).rejects.toThrow(/JSON array/);
  });
});
