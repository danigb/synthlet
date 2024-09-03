export function polyblepWaveformTypeToWaveform(
  type?: string
): number | undefined {
  return type === "sine"
    ? 0
    : type === "sawtooth"
    ? 1
    : type === "square"
    ? 2
    : type === "triangle"
    ? 3
    : undefined;
}

export function polyblepWaveformToWaveformType(
  waveform: number
): string | undefined {
  return waveform === 0
    ? "sine"
    : waveform === 1
    ? "sawtooth"
    : waveform === 2
    ? "square"
    : waveform === 3
    ? "triangle"
    : undefined;
}
