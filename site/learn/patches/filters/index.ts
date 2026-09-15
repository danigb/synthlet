import comb from "./comb";
import combSource from "./comb.ts?raw";
import resonance from "./resonance";
import resonanceSource from "./resonance.ts?raw";
import shootout from "./shootout";
import shootoutSource from "./shootout.ts?raw";
import slope from "./slope";
import slopeSource from "./slope.ts?raw";
import sweep from "./sweep";
import sweepSource from "./sweep.ts?raw";
import types from "./types";
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
export const filtersPatches = {
  "filters/comb": comb,
  "filters/slope": slope,
  "filters/types": types,
  "filters/resonance": resonance,
  "filters/sweep": sweep,
  "filters/shootout": shootout,
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
