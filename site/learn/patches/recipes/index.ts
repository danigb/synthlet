import bells from "./bells";
import bellsSource from "./bells.ts?raw";
import bowed from "./bowed";
import bowedSource from "./bowed.ts?raw";
import cymbals from "./cymbals";
import cymbalsSource from "./cymbals.ts?raw";
import ensemble from "./ensemble";
import ensembleSource from "./ensemble.ts?raw";
import flute from "./flute";
import fluteSource from "./flute.ts?raw";
import kick from "./kick";
import kickSource from "./kick.ts?raw";
import leslie from "./leslie";
import leslieSource from "./leslie.ts?raw";
import organ from "./organ";
import organSource from "./organ.ts?raw";
import piano from "./piano";
import pianoSource from "./piano.ts?raw";
import pluck from "./pluck";
import pluckSource from "./pluck.ts?raw";
import snare from "./snare";
import snareSource from "./snare.ts?raw";
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
 * the lesson. Where it ships the finished instrument - `KickDrum`,
 * `SnareDrum`, `CymbalDrum`, `CowBellDrum` - the patch rebuilds it from the
 * same modules in the same order, with the same constants, because `drum()`
 * exposes `trigger`, `tone`, `decay` and `volume` and nothing else, and every
 * drum lesson here is about a parameter that is not one of those four.
 */
export const recipesPatches = {
  "recipes/flute": flute,
  "recipes/ensemble": ensemble,
  "recipes/pluck": pluck,
  "recipes/bowed": bowed,
  "recipes/kick": kick,
  "recipes/snare": snare,
  "recipes/cymbals": cymbals,
  "recipes/bells": bells,
  "recipes/timpani": timpani,
  "recipes/piano": piano,
  "recipes/organ": organ,
  "recipes/leslie": leslie,
  "recipes/vowels": vowels,
};

/** The same files again, as text, for "View the code". Keyed exactly as above. */
export const recipesSources: Record<string, string> = {
  "recipes/flute": fluteSource,
  "recipes/ensemble": ensembleSource,
  "recipes/pluck": pluckSource,
  "recipes/bowed": bowedSource,
  "recipes/kick": kickSource,
  "recipes/snare": snareSource,
  "recipes/cymbals": cymbalsSource,
  "recipes/bells": bellsSource,
  "recipes/timpani": timpaniSource,
  "recipes/piano": pianoSource,
  "recipes/organ": organSource,
  "recipes/leslie": leslieSource,
  "recipes/vowels": vowelsSource,
};
