import { registerSynthletOnce } from "synthlet";

let promise: Promise<AudioContext>;

export function createSynthAudioContext(): Promise<AudioContext> {
  if (!promise) {
    promise = registerSynthletOnce(new AudioContext());
  }
  return promise;
}
