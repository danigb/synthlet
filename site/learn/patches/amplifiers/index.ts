import type { PatchLoader, SourceLoader } from "../define";

/*
 * Chapter 3's patches.
 *
 * Four amplifiers, and three of them are a `GainNode`: one in the audio path
 * with an LFO on it, one in a control path with an envelope on it, one that
 * never closes. The fourth is the same amplifier asked for more than it has.
 */
export const amplifiersPatches: Record<string, PatchLoader> = {
  "amplifiers/vca": () => import("./vca"),
  "amplifiers/env-amount": () => import("./env-amount"),
  "amplifiers/initial-gain": () => import("./initial-gain"),
  "amplifiers/clip": () => import("./clip"),
};

/** The same files again, as text, for "View the code". Keyed exactly as above. */
export const amplifiersSources: Record<string, SourceLoader> = {
  "amplifiers/vca": () => import("./vca.ts?raw"),
  "amplifiers/env-amount": () => import("./env-amount.ts?raw"),
  "amplifiers/initial-gain": () => import("./initial-gain.ts?raw"),
  "amplifiers/clip": () => import("./clip.ts?raw"),
};
