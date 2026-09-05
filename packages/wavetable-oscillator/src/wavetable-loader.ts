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

/**
 * A Wavetable loader compatible with wavedit-online wavetables.
 */
export class WavetableLoader {
  #data: Float32Array | undefined;
  #loaded: Promise<Wavetable>;

  constructor(
    public readonly url: string,
    public readonly wavetableLength: number,
  ) {
    this.#loaded = this.#load();
  }

  static async fetchAvailableNames() {
    const res = await fetch(
      "https://smpldsnds.github.io/wavedit-online/samples/files.json",
    );
    if (!res.ok) throw Error("Failed to load wavetable list.");
    const json = await res.json();
    return json as string[];
  }

  onLoad() {
    return this.#loaded;
  }

  getData() {
    return this.#data;
  }

  async #load() {
    const response = await fetch(this.url);
    if (!response.ok) throw new Error(`Failed to load ${this.url}`);
    const arrayBuffer = await response.arrayBuffer();
    // `decodeWavetable` still reports the header's sample rate — reporting it is a
    // WAV decoder's job — but nothing downstream needs it. Ticket 08 rewrites the
    // parsing around it.
    this.#data = WavetableLoader.decodeWavetable(arrayBuffer).data;
    return { data: this.#data, length: this.wavetableLength };
  }

  /**
   * Decode a WAV file into a Float32Array without resampling.
   *
   * We can't use AudioContext.decodeAudioData() because it resamples the audio.
   */
  static decodeWavetable(arrayBuffer: ArrayBuffer): {
    sampleRate: number;
    data: Float32Array;
  } {
    const dataView = new DataView(arrayBuffer);
    const format = dataView.getUint16(20, true);
    const sampleRate = dataView.getUint32(24, true);
    const numChannels = dataView.getUint16(22, true);
    const bitsPerSample = dataView.getUint16(34, true);
    const subChunk2Size = dataView.getUint32(40, true);

    if (format !== 1) {
      throw Error("Invalid format. Only PCM supported.");
    }

    if (numChannels !== 1) {
      throw Error("Invalid format. Only mono supported.");
    }

    const isFloat = bitsPerSample === 32;
    const bytesPerSample = bitsPerSample / 8;
    const numSamples = subChunk2Size / (bytesPerSample * numChannels);
    const pcmData = new Float32Array(numSamples);

    let offset = 44; // Skip the WAV header
    for (let i = 0; i < numSamples; i++) {
      for (let channel = 0; channel < numChannels; channel++) {
        const byteOffset =
          offset + (i * numChannels + channel) * bytesPerSample;
        pcmData[i] = isFloat
          ? dataView.getFloat32(byteOffset, true)
          : dataView.getInt16(byteOffset, true) / 32768;
      }
    }
    return { sampleRate, data: pcmData };
  }
}
