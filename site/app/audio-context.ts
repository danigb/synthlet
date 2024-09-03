import { registerSynthletOnce } from "synthlet";

export async function createSynthAudioContext(): Promise<AudioContext> {
  const audioContext = new AudioContext();
  await registerSynthletOnce(audioContext);
  return audioContext;
}
