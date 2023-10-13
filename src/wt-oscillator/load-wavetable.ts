export type DecodedWavetable = {
  sampleRate: number;
  data: Float32Array;
};

/**
 * Load a wavetable, either from a URL or from the list of wavetables.
 */
export async function loadWavetable(urlOrName: string): Promise<Float32Array> {
  const url = urlOrName.startsWith("http")
    ? urlOrName
    : `https://smpldsnds.github.io/wavedit-online/samples/${urlOrName.toUpperCase()}.WAV`;
  console.log({ url });

  const res = await fetch(url);
  if (!res.ok) throw Error("Failed to load wavetable: " + url);
  const arrayBuffer = await res.arrayBuffer();
  return decodeWavetable(arrayBuffer).data;
}

/**
 * Load wavetable file names from smpldsnds.github.io/wavedit-online/
 */
export async function fetchWavetableList() {
  const res = await fetch(
    "https://smpldsnds.github.io/wavedit-online/samples/files.json"
  );
  if (!res.ok) throw Error("Failed to load wavetable list.");
  const json = await res.json();
  return json as string[];
}

/**
 * Decode a WAV file into a Float32Array without resampling.
 *
 * We can't use AudioContext.decodeAudioData() because it resamples the audio.
 *
 */
export function decodeWavetable(arrayBuffer: ArrayBuffer): DecodedWavetable {
  const dataView = new DataView(arrayBuffer);
  const format = dataView.getUint16(20, true);
  const sampleRate = dataView.getUint32(24, true);
  const numChannels = dataView.getUint16(22, true);
  const bitsPerSample = dataView.getUint16(34, true);
  const subChunk2Size = dataView.getUint32(40, true);

  if (format !== 1) {
    throw Error("Invalid format. Only PCM supported.");
  }

  if (bitsPerSample !== 16 && bitsPerSample !== 32) {
    throw Error("Invalid format. Only 16 or 32 bits per sample supported.");
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
      const byteOffset = offset + (i * numChannels + channel) * bytesPerSample;
      pcmData[i] = isFloat
        ? dataView.getFloat32(byteOffset, true)
        : dataView.getInt16(byteOffset, true) / 32768;
    }
  }

  return { sampleRate, data: pcmData };
}
