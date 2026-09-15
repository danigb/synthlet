import { amplifiersPatches, amplifiersSources } from "./amplifiers";
import type { LessonPatch } from "./define";
import { envelopesPatches, envelopesSources } from "./envelopes";
import { filtersPatches, filtersSources } from "./filters";
import { modulationPatches, modulationSources } from "./modulation";
import playground from "./playground";
import playgroundSource from "./playground.ts?raw";
import { soundPatches, soundSources } from "./sound";
import voice from "./voice";
import voiceSource from "./voice.ts?raw";

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
  ...envelopesPatches,
  ...amplifiersPatches,
  ...filtersPatches,
  ...modulationPatches,
  // The tutorial voice, which belongs to no chapter: every chapter that teaches
  // a parameter rather than a module reaches for it, with a preset and a `show`.
  voice,
  // The same voice with nothing hidden, which is `/learn/playground`. It is a
  // patch and not a page's private component so that it is rendered by the kit,
  // held to the same rules, and readable under "View the code" like every other.
  playground,
};

/** The same files as text, for "View the code". Keyed exactly as above. */
const sources: Record<string, string> = {
  ...soundSources,
  ...envelopesSources,
  ...amplifiersSources,
  ...filtersSources,
  ...modulationSources,
  voice: voiceSource,
  playground: playgroundSource,
};

/** The patch a lesson asked for, or `undefined` - never a throw at render. */
export function getPatch(id: string): LessonPatch | undefined {
  return patches[id];
}

/** The text of the file that patch lives in, or `undefined`. */
export function getPatchSource(id: string): string | undefined {
  return sources[id];
}
