import type { PatchLoader, SourceLoader } from "../define";

/*
 * Chapter 2's patches.
 *
 * Four, and the first of them is three lessons: 2.1, 2.2 and 2.3 are the same
 * widget with one more slider revealed each time, which is what `show` is for
 * and why a chapter does not need a patch per page.
 */
export const envelopesPatches: Record<string, PatchLoader> = {
  "envelopes/adsr": () => import("./adsr"),
  "envelopes/matching": () => import("./matching"),
  "envelopes/gates": () => import("./gates"),
  "envelopes/beyond": () => import("./beyond"),
};

/** The same files again, as text, for "View the code". Keyed exactly as above. */
export const envelopesSources: Record<string, SourceLoader> = {
  "envelopes/adsr": () => import("./adsr.ts?raw"),
  "envelopes/matching": () => import("./matching.ts?raw"),
  "envelopes/gates": () => import("./gates.ts?raw"),
  "envelopes/beyond": () => import("./beyond.ts?raw"),
};
