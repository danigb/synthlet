import type { LessonPatch } from "../define";

/*
 * Chapter 7's patches, in the order the chapter reads them.
 *
 * Empty, and registered anyway: the chapter is registered here so that the
 * agent writing it adds lines to this file and never to the shared
 * `patches/index.ts`. `20260915_learningsynthlet12_chapters_6_7_time_and_voices.md` fills it.
 */
export const voicesPatches: Record<string, LessonPatch> = {};

/** The same files again, as text, for "View the code". Keyed exactly as above. */
export const voicesSources: Record<string, string> = {};
