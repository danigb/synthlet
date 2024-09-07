import { registerSynthlet } from "synthlet";

let promise: Promise<AudioContext>;

export function createSynthAudioContext(): Promise<AudioContext> {
  if (!promise) {
    promise = registerSynthlet(new AudioContext());
  }
  return promise;
}
