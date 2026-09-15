import type { PatchLoader } from "../define";
import clipSource from "./clip.ts?raw";
import envAmountSource from "./env-amount.ts?raw";
import initialGainSource from "./initial-gain.ts?raw";
import vcaSource from "./vca.ts?raw";

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
export const amplifiersSources: Record<string, string> = {
  "amplifiers/vca": vcaSource,
  "amplifiers/env-amount": envAmountSource,
  "amplifiers/initial-gain": initialGainSource,
  "amplifiers/clip": clipSource,
};
