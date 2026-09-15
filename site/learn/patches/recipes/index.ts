import type { PatchLoader } from "../define";
import bellsSource from "./bells.ts?raw";
import bowedSource from "./bowed.ts?raw";
import cymbalsSource from "./cymbals.ts?raw";
import ensembleSource from "./ensemble.ts?raw";
import fluteSource from "./flute.ts?raw";
import kickSource from "./kick.ts?raw";
import leslieSource from "./leslie.ts?raw";
import organSource from "./organ.ts?raw";
import pianoSource from "./piano.ts?raw";
import pluckSource from "./pluck.ts?raw";
import snareSource from "./snare.ts?raw";
import timpaniSource from "./timpani.ts?raw";
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
export const recipesPatches: Record<string, PatchLoader> = {
  "recipes/flute": () => import("./flute"),
  "recipes/ensemble": () => import("./ensemble"),
  "recipes/pluck": () => import("./pluck"),
  "recipes/bowed": () => import("./bowed"),
  "recipes/kick": () => import("./kick"),
  "recipes/snare": () => import("./snare"),
  "recipes/cymbals": () => import("./cymbals"),
  "recipes/bells": () => import("./bells"),
  "recipes/timpani": () => import("./timpani"),
  "recipes/piano": () => import("./piano"),
  "recipes/organ": () => import("./organ"),
  "recipes/leslie": () => import("./leslie"),
  "recipes/vowels": () => import("./vowels"),
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
