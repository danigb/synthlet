export function decodeWavetable(arrayBuffer: ArrayBuffer): Float32Array | null {
  const dataView = new DataView(arrayBuffer);
  const format = dataView.getUint16(20, true);
  const numChannels = dataView.getUint16(22, true);
  const bitsPerSample = dataView.getUint16(34, true);
  const subChunk2Size = dataView.getUint32(40, true);

  if (format !== 1 || (bitsPerSample !== 16 && bitsPerSample !== 32)) {
    console.error("Unsupported WAV format.");
    return null;
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

  return pcmData;
}
