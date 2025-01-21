import { registerAllWorklets } from "synthlet";

let audioContext: AudioContext;
let promise: Promise<AudioContext>;

export function getAudioContext(): AudioContext {
  if (typeof AudioContext === "undefined") return null!;
  audioContext ??= new AudioContext();
  return audioContext;
}

export function createSynthAudioContext(): Promise<AudioContext> {
  if (!promise) {
    promise = registerAllWorklets(getAudioContext());
  }
  return promise;
}
