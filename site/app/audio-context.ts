import { registerAllWorklets } from "synthlet";

let promise: Promise<AudioContext>;

export function createSynthAudioContext(): Promise<AudioContext> {
  if (!promise) {
    promise = registerAllWorklets(new AudioContext());
  }
  return promise;
}
