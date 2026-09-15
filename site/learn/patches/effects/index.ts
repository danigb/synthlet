import type { PatchLoader } from "../define";
import analogSource from "./analog.ts?raw";
import bodySource from "./body.ts?raw";
import chorusSource from "./chorus.ts?raw";
import delaySource from "./delay.ts?raw";
import reverbSource from "./reverb.ts?raw";

/*
 * Chapter 9's patches, in the order the chapter reads them.
 *
 * Every one of the five is a delay line, which is the chapter's whole argument.
 * The first is the delay as everybody knows it; the second is the same delay
 * made of tape and of buckets, where the errors are the character; the third
 * modulates the delay time until three copies of one signal sound like three
 * players; the fourth chains three of them until the repeats stop being
 * countable and become a room. The fifth moves the line to the front of the
 * patch, where it is no longer an effect at all.
 */
export const effectsPatches: Record<string, PatchLoader> = {
  "effects/delay": () => import("./delay"),
  "effects/analog": () => import("./analog"),
  "effects/chorus": () => import("./chorus"),
  "effects/reverb": () => import("./reverb"),
  "effects/body": () => import("./body"),
};

/** The same files again, as text, for "View the code". Keyed exactly as above. */
export const effectsSources: Record<string, string> = {
  "effects/delay": delaySource,
  "effects/analog": analogSource,
  "effects/chorus": chorusSource,
  "effects/reverb": reverbSource,
  "effects/body": bodySource,
};
