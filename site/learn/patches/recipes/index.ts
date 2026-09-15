import type { PatchLoader, SourceLoader } from "../define";

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
export const recipesSources: Record<string, SourceLoader> = {
  "recipes/flute": () => import("./flute.ts?raw"),
  "recipes/ensemble": () => import("./ensemble.ts?raw"),
  "recipes/pluck": () => import("./pluck.ts?raw"),
  "recipes/bowed": () => import("./bowed.ts?raw"),
  "recipes/kick": () => import("./kick.ts?raw"),
  "recipes/snare": () => import("./snare.ts?raw"),
  "recipes/cymbals": () => import("./cymbals.ts?raw"),
  "recipes/bells": () => import("./bells.ts?raw"),
  "recipes/timpani": () => import("./timpani.ts?raw"),
  "recipes/piano": () => import("./piano.ts?raw"),
  "recipes/organ": () => import("./organ.ts?raw"),
  "recipes/leslie": () => import("./leslie.ts?raw"),
  "recipes/vowels": () => import("./vowels.ts?raw"),
};
