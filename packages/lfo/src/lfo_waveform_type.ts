const TYPES = [
  "Impulse",
  "Sine",
  "Triangle",
  "RampUp",
  "RampDown",
  "Square",
  "ExpRampUp",
  "ExpRampDown",
  "ExpTriangle",
  "RandSampleHold",
] as const;

export type LfoWaveformType = (typeof TYPES)[number];

export function getLfoWaveformTypes(): LfoWaveformType[] {
  return TYPES as unknown as LfoWaveformType[];
}

export function lfoWaveformFromType(type: string): number | undefined {
  const index = TYPES.indexOf(type as LfoWaveformType);
  return index === -1 ? undefined : index;
}

export function lfoWaveformToType(
  waveform: number
): LfoWaveformType | undefined {
  return TYPES[waveform];
}
