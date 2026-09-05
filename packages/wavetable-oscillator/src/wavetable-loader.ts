/**
 * A wavetable: `data` holds one or more consecutive planes of `length` samples.
 *
 * The file's own sample rate is deliberately not here. A single-cycle table has
 * no meaningful rate — `length` samples are one cycle whatever the header says —
 * and the pitch comes from the *context* rate and `length`, both of which the
 * worklet holds. Carrying it would invite the belief that the pitch depends on
 * it, which is the bug this type used to help produce.
 */
export type Wavetable = {
  data: Float32Array;
  length: number;
  /**
   * How many mipmap levels `data` holds, packed level-major:
   * `data[(level * planes + plane) * length + index]`. Level `i` is the same
   * planes band-limited to `length/2 / 2^i` harmonics, and the oscillator
   * crossfades the two nearest levels — see `wavetable-builder.ts`.
   *
   * Absent or 1 means "no pyramid": a plain table of consecutive planes, which
   * the oscillator plays from level 0 alone. `setWavetable` builds the pyramid
   * for anything that arrives that way, so a caller never has to.
   */
  levels?: number;
};

// --- the WAV decoder --------------------------------------------------------
//
// A RIFF file is a *chunk list*, not a fixed layout. This decoder used to
// assume one: format at byte 20, bits at 34, samples from 44. That is correct
// for exactly one flavour of WAV file and silently wrong for several common
// ones — a `LIST` metadata chunk before `data` made it read the metadata as
// audio, `fact` (which the spec *requires* for non-PCM) made it return two
// samples out of eight, and 24-bit files came back as a different waveform at a
// different amplitude, none of it raising an error. So: walk the chunks.

/** `fmt ` format tags, by the number that appears in the file. */
const PCM = 1;
const IEEE_FLOAT = 3;
const EXTENSIBLE = 0xfffe;

/** Named only so an unsupported file says what it is instead of a number. */
const FORMAT_NAMES: Record<number, string> = {
  [PCM]: "PCM",
  [IEEE_FLOAT]: "IEEE float",
  2: "Microsoft ADPCM",
  6: "A-law",
  7: "mu-law",
  17: "IMA ADPCM",
  85: "MP3",
  [EXTENSIBLE]: "extensible",
};

const formatName = (tag: number) =>
  FORMAT_NAMES[tag] ? `${tag} (${FORMAT_NAMES[tag]})` : String(tag);

export type DecodedWav = {
  /**
   * The header's sample rate. Reporting it is a WAV decoder's job, but nothing
   * downstream uses it: a single-cycle table has no meaningful rate, which is
   * what `Wavetable`'s comment above is about.
   */
  sampleRate: number;
  channels: number;
  /** Channel-interleaved samples in `-1..1`. */
  data: Float32Array;
};

type Fmt = {
  tag: number;
  channels: number;
  sampleRate: number;
  bits: number;
};

/** Reads one sample of the file's format at a byte offset. */
type SampleReader = (view: DataView, at: number) => number;

/**
 * Decode a WAV file into a `Float32Array` without resampling.
 *
 * `AudioContext.decodeAudioData` is not usable here: it resamples to the
 * context rate, which for a single-cycle table changes the frame length and so
 * every plane boundary and every pitch.
 *
 * Supported: PCM (tag 1) at 8, 16, 24 and 32 bits, IEEE float (tag 3) at 32 and
 * 64, and `WAVE_FORMAT_EXTENSIBLE` (0xFFFE) wrapping either. Anything else
 * throws with the tag and depth in the message.
 */
export function decodeWav(buffer: ArrayBuffer): DecodedWav {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const id = (at: number) =>
    String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);

  if (bytes.length < 12) {
    throw Error(
      `Not a WAV file: ${bytes.length} bytes is too short for a RIFF header.`,
    );
  }
  if (id(0) !== "RIFF") {
    throw Error(`Not a WAV file: expected "RIFF" at byte 0, found "${id(0)}".`);
  }
  if (id(8) !== "WAVE") {
    throw Error(
      `Not a WAV file: expected "WAVE" at byte 8, found "${id(8)}". ` +
        `RIFF holds other things too.`,
    );
  }

  let format: Fmt | undefined;
  let data: { at: number; size: number } | undefined;
  let at = 12;
  while (at + 8 <= bytes.length) {
    const chunk = id(at);
    const size = view.getUint32(at + 4, true);
    const body = at + 8;
    if (chunk === "fmt ") format = readFmt(view, body, size);
    else if (chunk === "data") data = { at: body, size };
    // Every chunk is padded to an even length, and the pad byte is not counted
    // in `size`. Ignoring it walks off by one and reads the next id as audio.
    at = body + size + (size % 2);
  }

  if (!format) throw Error(`WAV file has no "fmt " chunk.`);
  if (!data) throw Error(`WAV file has no "data" chunk.`);
  if (format.channels < 1) {
    throw Error(`WAV file declares ${format.channels} channels.`);
  }

  const width = format.bits / 8;
  const stride = width * format.channels;
  if (!Number.isInteger(width) || width < 1) {
    throw Error(`WAV file declares ${format.bits} bits per sample.`);
  }
  if (data.at + data.size > bytes.length) {
    throw Error(
      `Truncated WAV file: the "data" chunk declares ${data.size} bytes but ` +
        `only ${Math.max(0, bytes.length - data.at)} are present.`,
    );
  }

  const read = sampleReader(format.tag, format.bits);
  const count = Math.floor(data.size / stride) * format.channels;
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) out[i] = read(view, data.at + i * width);
  return {
    sampleRate: format.sampleRate,
    channels: format.channels,
    data: out,
  };
}

function readFmt(view: DataView, at: number, size: number): Fmt {
  if (size < 16) {
    throw Error(`WAV "fmt " chunk is ${size} bytes, expected at least 16.`);
  }
  let tag = view.getUint16(at, true);
  const channels = view.getUint16(at + 2, true);
  const sampleRate = view.getUint32(at + 4, true);
  const bits = view.getUint16(at + 14, true);
  if (tag === EXTENSIBLE) {
    // The real format tag is the first field of the 16-byte subformat GUID,
    // which is where every extensible file puts it. A 32-bit float written by
    // a DAW is very often this rather than a bare tag 3.
    if (size < 40) {
      throw Error(
        `WAV extensible "fmt " chunk is ${size} bytes, expected at least 40.`,
      );
    }
    tag = view.getUint16(at + 24, true);
  }
  return { tag, channels, sampleRate, bits };
}

/**
 * The reader for one `(tag, bits)` pair.
 *
 * **The tag decides, and the depth only picks the width.** The old code decided
 * with `isFloat = bitsPerSample === 32`, placed after a `format !== 1` guard —
 * so it could only ever be true for 32-bit *integer* PCM, which it then read
 * with `getFloat32`. That is not merely wrong: any sample at or above
 * 0.99609375 of full scale encodes to an int32 whose exponent bits are all one,
 * which `getFloat32` reads as `NaN`, and one `NaN` poisons the oscillator's
 * whole output. A genuine float file, meanwhile, was rejected outright.
 */
function sampleReader(tag: number, bits: number): SampleReader {
  if (tag === IEEE_FLOAT) {
    if (bits === 32) return (v, at) => v.getFloat32(at, true);
    if (bits === 64) return (v, at) => v.getFloat64(at, true);
  }
  if (tag === PCM) {
    // 8-bit WAV is the odd one out: unsigned, silence at 128.
    if (bits === 8) return (v, at) => (v.getUint8(at) - 128) / 128;
    if (bits === 16) return (v, at) => v.getInt16(at, true) / 32768;
    if (bits === 24) {
      return (v, at) => {
        const n =
          v.getUint8(at) |
          (v.getUint8(at + 1) << 8) |
          (v.getUint8(at + 2) << 16);
        // Sign-extend by pushing the top byte into bit 31 and back down.
        return ((n << 8) >> 8) / 8388608;
      };
    }
    if (bits === 32) return (v, at) => v.getInt32(at, true) / 2147483648;
  }
  throw Error(
    `Unsupported WAV format ${formatName(tag)} at ${bits} bits per sample. ` +
      `Supported: PCM at 8, 16, 24 or 32 bits, and IEEE float at 32 or 64.`,
  );
}

/**
 * Decode a WAV file as a wavetable of `length`-sample planes.
 *
 * Two checks on top of `decodeWav`, both of them things that used to fail
 * silently:
 *
 * - **Mono.** A wavetable's planes are consecutive, not interleaved, so a
 *   stereo file is not a wavetable at a different layout — it is a different
 *   thing, and keeping one of its channels would be a guess.
 * - **A whole number of frames.** `length` is an assumption the caller makes
 *   about someone else's file. If it is wrong, every plane boundary and every
 *   pitch is wrong, and nothing downstream can tell. So it is checked here.
 */
export function decodeWavetable(
  buffer: ArrayBuffer,
  length: number,
): Wavetable {
  if (!Number.isInteger(length) || length < 2) {
    throw Error(
      `Wavetable frame length must be an integer >= 2, got ${length}.`,
    );
  }
  const wav = decodeWav(buffer);
  if (wav.channels !== 1) {
    throw Error(
      `Wavetable WAV has ${wav.channels} channels: only mono is supported, ` +
        `because a wavetable's channels are its planes and they are stored ` +
        `one after another rather than interleaved.`,
    );
  }
  if (wav.data.length === 0) throw Error(`Wavetable WAV holds no samples.`);
  if (wav.data.length % length !== 0) {
    throw Error(
      `Wavetable WAV holds ${wav.data.length} samples, which is not a whole ` +
        `number of ${length}-sample frames. Pass the file's real frame ` +
        `length as \`length\`.`,
    );
  }
  return { data: wav.data, length };
}

// --- the catalog ------------------------------------------------------------

/**
 * Where a bare wavetable name resolves, and how the name list is fetched.
 *
 * Pass one to `loadWavetable`, `fetchWavetableNames` or the oscillator's
 * construction options to fetch from somewhere else — a self-hosted mirror, a
 * bundled folder, an in-memory map in a test.
 */
export type WavetableCatalog = {
  /** The URL for a bare name, e.g. `"SYNLP10"`. */
  url(name: string): string;
  /** Every name the catalog holds. */
  names(): Promise<string[]>;
};

/**
 * The WaveEdit Online mirror this package has always defaulted to.
 *
 * **It is a third party's GitHub Pages site, not ours.** The tables come from
 * [WaveEdit Online](https://waveeditonline.com/) and this is a static mirror of
 * them; nothing here controls its uptime, its contents or its CORS headers, and
 * a strict CSP will block it. `docs/vision.md`'s cross-tier rule is that every
 * URL must be overridable and self-hostable, and `waveditCatalog(baseUrl)` is
 * how: copy the files anywhere and pass the base URL.
 */
export const WAVEDIT_BASE_URL =
  "https://smpldsnds.github.io/wavedit-online/samples";

/** Anything already addressable is passed through instead of being resolved. */
const isUrl = (name: string) => /^(https?:|blob:|data:|\.?\/)/.test(name);

/**
 * A catalog of WaveEdit-Online-shaped files under `baseUrl`: `NAME.WAV` for
 * each table, and a `files.json` holding the list of names.
 */
export function waveditCatalog(baseUrl = WAVEDIT_BASE_URL): WavetableCatalog {
  const base = baseUrl.replace(/\/+$/, "");
  return {
    url: (name) => (isUrl(name) ? name : `${base}/${name.toUpperCase()}.WAV`),
    async names() {
      const url = `${base}/files.json`;
      const response = await fetch(url);
      if (!response.ok) {
        throw Error(
          `Failed to load the wavetable list from ${url}: ` +
            `${response.status} ${response.statusText}`,
        );
      }
      const json = await response.json();
      // A misconfigured static host answers a missing path with an HTML page
      // and a 200, so `res.ok` is not enough to trust the body.
      if (!Array.isArray(json) || json.some((n) => typeof n !== "string")) {
        throw Error(`${url} did not return a JSON array of wavetable names.`);
      }
      return json as string[];
    },
  };
}

/** `undefined` → the default mirror, a string → a base URL, else itself. */
export function toCatalog(
  catalog?: WavetableCatalog | string,
): WavetableCatalog {
  if (catalog === undefined) return waveditCatalog();
  return typeof catalog === "string" ? waveditCatalog(catalog) : catalog;
}

/**
 * Fetch and decode one wavetable from a URL.
 *
 * The returned promise **rejects** — on a network failure, a non-200, a file
 * that is not a WAV, a format this package cannot read, a stereo file, or a
 * sample count that is not a whole number of `length`-sample frames — and every
 * rejection carries a message naming what was found. Handle it: the oscillator
 * keeps playing whatever table it already has.
 */
export async function fetchWavetable(
  url: string,
  length: number,
): Promise<Wavetable> {
  const response = await fetch(url);
  if (!response.ok) {
    throw Error(
      `Failed to load a wavetable from ${url}: ` +
        `${response.status} ${response.statusText}`,
    );
  }
  return decodeWavetable(await response.arrayBuffer(), length);
}
