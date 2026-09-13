import type { LessonPatch } from "./define";
import { soundPatches } from "./sound";

/**
 * Every patch in the tutorial, by id.
 *
 * A lesson refers to its widget by id and imports nothing, which is the rule
 * the whole section is built on - so this registry is the only way a name in an
 * `.mdx` file can reach code. It is explicit on purpose: a glob would make the
 * set of patches depend on what happens to be on disk, and "the id is the path"
 * would stop being something a test can check.
 *
 * **Adding a patch**: write `<chapter>/<name>.ts`, then add one line to
 * `<chapter>/index.ts`. A new chapter also adds one line here. See
 * `site/learn/README.md`.
 */
export const patches: Record<string, LessonPatch> = {
  ...soundPatches,
};

/** The patch a lesson asked for, or `undefined` - never a throw at render. */
export function getPatch(id: string): LessonPatch | undefined {
  return patches[id];
}
