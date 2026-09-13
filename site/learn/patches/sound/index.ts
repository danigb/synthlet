import harmonics from "./harmonics";

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
