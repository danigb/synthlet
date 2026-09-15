import comb from "./comb";
import combSource from "./comb.ts?raw";
import resonance from "./resonance";
import resonanceSource from "./resonance.ts?raw";
import slope from "./slope";
import slopeSource from "./slope.ts?raw";
import types from "./types";
import typesSource from "./types.ts?raw";

/*
 * Chapter 4's patches, in the order the chapter reads them.
 *
 * A filter is a thing that takes some of a sound away, and the four here take
 * it away in four different ways: by cancelling a copy of the signal against
 * itself, by a slope, by which side of the knee is kept, and by what happens
 * when the knee is fed back into itself.
 *
 * The chapter is still being written: `filters/sweep` and `filters/shootout`
 * add a line each to the two records below and touch nothing else.
 */
export const filtersPatches = {
  "filters/comb": comb,
  "filters/slope": slope,
  "filters/types": types,
  "filters/resonance": resonance,
};

/** The same files again, as text, for "View the code". Keyed exactly as above. */
export const filtersSources: Record<string, string> = {
  "filters/comb": combSource,
  "filters/slope": slopeSource,
  "filters/types": typesSource,
  "filters/resonance": resonanceSource,
};
