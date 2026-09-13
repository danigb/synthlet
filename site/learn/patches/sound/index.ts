import harmonics from "./harmonics";
import harmonicsSource from "./harmonics.ts?raw";

/*
 * Chapter 1's patches.
 *
 * One import and one line per patch, written out. A chapter has a file of its
 * own so that the six agents writing the six remaining chapters each touch a
 * different one; the top-level `index.ts` only ever gains a line when a whole
 * chapter appears.
 *
 * The key is written literally rather than taken from `patch.id`. That makes
 * three independent statements of the same name - the key, the `id` in the
 * patch file, and the file's own path - and `rules.test.ts` fails unless all
 * three agree, so a typo in any one of them is caught.
 */
export const soundPatches = {
  "sound/harmonics": harmonics,
};

/*
 * The same files again, as text.
 *
 * `?raw` is the whole of "View the code": the widget shows the module it is
 * running, so there is no second copy to fall out of step with the first. The
 * import sits beside the module's own on purpose - adding a patch is still one
 * line, and it is impossible to register a patch and forget its source without
 * the line above it looking wrong.
 */
export const soundSources: Record<string, string> = {
  "sound/harmonics": harmonicsSource,
};
