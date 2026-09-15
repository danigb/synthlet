import type { LessonPatch } from "../define";

/*
 * Chapter 8's patches, in the order the chapter reads them.
 *
 * Empty, and registered anyway: the chapter is registered here so that the
 * agent writing it adds lines to this file and never to the shared
 * `patches/index.ts`. `20260915_learningsynthlet13_chapter_8_recipes.md` fills it.
 */
export const recipesPatches: Record<string, LessonPatch> = {};

/** The same files again, as text, for "View the code". Keyed exactly as above. */
export const recipesSources: Record<string, string> = {};
