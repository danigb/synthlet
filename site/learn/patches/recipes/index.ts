import bowed from "./bowed";
import bowedSource from "./bowed.ts?raw";
import ensemble from "./ensemble";
import ensembleSource from "./ensemble.ts?raw";
import flute from "./flute";
import fluteSource from "./flute.ts?raw";
import piano from "./piano";
import pianoSource from "./piano.ts?raw";
import pluck from "./pluck";
import pluckSource from "./pluck.ts?raw";
import timpani from "./timpani";
import timpaniSource from "./timpani.ts?raw";
import vowels from "./vowels";
import vowelsSource from "./vowels.ts?raw";

/*
 * Chapter 8's patches, in the order the chapter reads them.
 *
 * A recipe is built from blocks rather than called as a factory. Where the
 * library ships a *block* that is the whole recipe - `KarplusStrong`,
 * `ModalResonator`, `Chorus` - the patch uses it, because that is the point of
 * the lesson. Where it ships the finished instrument, the patch rebuilds it
 * from the same modules in the same order, so that the reader can reach the
 * parameters the lesson is about: `drum()` exposes `trigger`, `tone`, `decay`
 * and `volume` and nothing else, and every drum lesson here needs more than
 * those four.
 */
export const recipesPatches = {
  "recipes/flute": flute,
  "recipes/ensemble": ensemble,
  "recipes/pluck": pluck,
  "recipes/bowed": bowed,
  "recipes/timpani": timpani,
  "recipes/piano": piano,
  "recipes/vowels": vowels,
};

/** The same files again, as text, for "View the code". Keyed exactly as above. */
export const recipesSources: Record<string, string> = {
  "recipes/flute": fluteSource,
  "recipes/ensemble": ensembleSource,
  "recipes/pluck": pluckSource,
  "recipes/bowed": bowedSource,
  "recipes/timpani": timpaniSource,
  "recipes/piano": pianoSource,
  "recipes/vowels": vowelsSource,
};
