import type { LessonPatch } from "../define";

/*
 * Chapter 10's patches, in the order the chapter reads them.
 *
 * Empty, and registered anyway: the chapter is registered here so that the
 * agent writing it adds lines to this file and never to the shared
 * `patches/index.ts`. `20260915_learningsynthlet14_chapters_9_10_effects_and_beyond.md` fills it.
 */
export const beyondPatches: Record<string, LessonPatch> = {};

/** The same files again, as text, for "View the code". Keyed exactly as above. */
export const beyondSources: Record<string, string> = {};
