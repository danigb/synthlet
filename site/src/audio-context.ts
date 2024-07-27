import { registerSynthletOnce } from "synthlet";

export async function createSynthAudioContext(): Promise<AudioContext> {
  console.log("CREATE CONTEXT");
  const audioContext = new AudioContext();
  console.log("REGISTERED");
  await registerSynthletOnce(audioContext);
  return audioContext;
}
