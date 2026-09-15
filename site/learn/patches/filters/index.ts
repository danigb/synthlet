import type { PatchLoader } from "../define";
import combSource from "./comb.ts?raw";
import resonanceSource from "./resonance.ts?raw";
import shootoutSource from "./shootout.ts?raw";
import slopeSource from "./slope.ts?raw";
import sweepSource from "./sweep.ts?raw";
import typesSource from "./types.ts?raw";

/*
 * Chapter 4's patches, in the order the chapter reads them.
 *
 * A filter is a thing that takes some of a sound away, and the six here take it
 * away in six different ways: by cancelling a copy of the signal against
 * itself, by a slope, by which side of the knee is kept, by what happens when
 * the knee is fed back into itself, by moving the knee while a note is held,
 * and - last - by being a different circuit altogether.
 */
export const filtersPatches: Record<string, PatchLoader> = {
  "filters/comb": () => import("./comb"),
  "filters/slope": () => import("./slope"),
  "filters/types": () => import("./types"),
  "filters/resonance": () => import("./resonance"),
  "filters/sweep": () => import("./sweep"),
  "filters/shootout": () => import("./shootout"),
};

/** The same files again, as text, for "View the code". Keyed exactly as above. */
export const filtersSources: Record<string, string> = {
  "filters/comb": combSource,
  "filters/slope": slopeSource,
  "filters/types": typesSource,
  "filters/resonance": resonanceSource,
  "filters/sweep": sweepSource,
  "filters/shootout": shootoutSource,
};
