import adsr from "./adsr";
import adsrSource from "./adsr.ts?raw";
import beyond from "./beyond";
import beyondSource from "./beyond.ts?raw";
import gates from "./gates";
import gatesSource from "./gates.ts?raw";
import matching from "./matching";
import matchingSource from "./matching.ts?raw";

/*
 * Chapter 2's patches.
 *
 * Four, and the first of them is three lessons: 2.1, 2.2 and 2.3 are the same
 * widget with one more slider revealed each time, which is what `show` is for
 * and why a chapter does not need a patch per page.
 */
export const envelopesPatches = {
  "envelopes/adsr": adsr,
  "envelopes/matching": matching,
  "envelopes/gates": gates,
  "envelopes/beyond": beyond,
};

/** The same files again, as text, for "View the code". Keyed exactly as above. */
export const envelopesSources: Record<string, string> = {
  "envelopes/adsr": adsrSource,
  "envelopes/matching": matchingSource,
  "envelopes/gates": gatesSource,
  "envelopes/beyond": beyondSource,
};
