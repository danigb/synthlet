export function midiToFreq(midi: number) {
  return Math.pow(2, (midi - 69) / 12) * 440;
}
