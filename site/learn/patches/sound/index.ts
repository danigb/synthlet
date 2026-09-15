import type { PatchLoader, SourceLoader } from "../define";

/*
 * Chapter 1's patches.
 *
 * One line per patch, written out, and the line is a `() => import()` rather
 * than the patch (02c): the id is what this file declares, and the bundler is
 * what decides when to fetch the module behind it. A chapter has a file of its
 * own so that the six agents writing the six remaining chapters each touch a
 * different one; the top-level `index.ts` only ever gains a line when a whole
 * chapter appears.
 *
 * The key is written literally rather than taken from `patch.id`. That makes
 * three independent statements of the same name - the key, the `id` in the
 * patch file, and the file's own path - and `rules.test.ts` fails unless all
 * three agree, so a typo in any one of them is caught.
 */
export const soundPatches: Record<string, PatchLoader> = {
  "sound/harmonics": () => import("./harmonics"),
  "sound/tone": () => import("./tone"),
  "sound/waveforms": () => import("./waveforms"),
  "sound/noise": () => import("./noise"),
};

/*
 * The same files again, as text.
 *
 * `?raw` is the whole of "View the code": the widget shows the module it is
 * running, so there is no second copy to fall out of step with the first. The
 * line sits beside the module's own on purpose - adding a patch is still one
 * line, and it is impossible to register a patch and forget its source without
 * the line above it looking wrong.
 *
 * Lazy like the module, and more so (03c): a patch minifies and its *source
 * text* does not, so sixty of these were the largest thing on a lesson page.
 * Nobody reads one without asking, so `kit/CodeView.tsx` fetches the one file
 * whose panel the reader opened.
 */
export const soundSources: Record<string, SourceLoader> = {
  "sound/harmonics": () => import("./harmonics.ts?raw"),
  "sound/tone": () => import("./tone.ts?raw"),
  "sound/waveforms": () => import("./waveforms.ts?raw"),
  "sound/noise": () => import("./noise.ts?raw"),
};
