import { amplifiersPatches, amplifiersSources } from "./amplifiers";
import { beyondPatches, beyondSources } from "./beyond";
import type {
  LessonPatch,
  PatchLoader,
  PatchSource,
  SourceLoader,
} from "./define";
import { effectsPatches, effectsSources } from "./effects";
import { envelopesPatches, envelopesSources } from "./envelopes";
import { filtersPatches, filtersSources } from "./filters";
import { modulationPatches, modulationSources } from "./modulation";
import { recipesPatches, recipesSources } from "./recipes";
import { soundPatches, soundSources } from "./sound";
import { timePatches, timeSources } from "./time";
import { voicesPatches, voicesSources } from "./voices";

/**
 * Every patch in the tutorial, by id.
 *
 * A lesson refers to its widget by id and imports nothing, which is the rule
 * the whole section is built on - so this registry is the only way a name in an
 * `.mdx` file can reach code. It is explicit on purpose: a glob would make the
 * set of patches depend on what happens to be on disk, and "the id is the path"
 * would stop being something a test can check.
 *
 * The value is a `() => import()` rather than the patch, which is 02c, and the
 * source below it is the same, which is 03c. The registry has to be one object
 * - `rules.test.ts` reads it, `<Patch>` resolves an id against it - but nothing
 * said the *bundle* had to be one object, and with sixty patches registered a
 * lesson page carried all sixty modules and all sixty source texts to show one.
 * A table of thunks is a few hundred bytes; the patch arrives when a widget
 * mounts and asks for it, and its text when a reader opens the code panel.
 *
 * **Adding a patch**: write `<chapter>/<name>.ts`, then add one line to
 * `<chapter>/index.ts`. A new chapter also adds one line here. See
 * `site/learn/README.md`.
 */
export const patchLoaders: Record<string, PatchLoader> = {
  ...soundPatches,
  ...envelopesPatches,
  ...amplifiersPatches,
  ...filtersPatches,
  ...modulationPatches,
  ...timePatches,
  ...voicesPatches,
  ...recipesPatches,
  ...effectsPatches,
  ...beyondPatches,
  // The tutorial voice, which belongs to no chapter: every chapter that teaches
  // a parameter rather than a module reaches for it, with a preset and a `show`.
  voice: () => import("./voice"),
  // The same voice with nothing hidden, which is `/learn/playground`. It is a
  // patch and not a page's private component so that it is rendered by the kit,
  // held to the same rules, and readable under "View the code" like every other.
  playground: () => import("./playground"),
};

/** The same files as text, for "View the code". Keyed exactly as above. */
const sourceLoaders: Record<string, SourceLoader> = {
  ...soundSources,
  ...envelopesSources,
  ...amplifiersSources,
  ...filtersSources,
  ...modulationSources,
  ...timeSources,
  ...voicesSources,
  ...recipesSources,
  ...effectsSources,
  ...beyondSources,
  voice: () => import("./voice.ts?raw"),
  playground: () => import("./playground.ts?raw"),
};

/** The ids, in registry order. What rule 2 checks the disk against. */
export const patchIds: string[] = Object.keys(patchLoaders);

/** Is this id a patch at all? Answered without fetching anything. */
export function hasPatch(id: string): boolean {
  return id in patchLoaders;
}

/**
 * The patch a lesson asked for, or `undefined` - never a throw at render.
 *
 * `import()` caches, so the second widget on a page that names the same patch
 * pays nothing; the promise is what the kit waits on while it draws its frame.
 */
export async function loadPatch(id: string): Promise<LessonPatch | undefined> {
  const loader = patchLoaders[id];
  return loader ? (await loader()).default : undefined;
}

/**
 * Every patch, loaded.
 *
 * For the tests and nothing else: `rules.test.ts` wants every patch's controls
 * in one pass, in node, with no bundler, and has no bundle to care about. The
 * kit never calls this - a lesson loads one patch.
 */
export async function loadPatches(): Promise<Record<string, LessonPatch>> {
  const loaded = await Promise.all(
    patchIds.map(async (id) => [id, await loadPatch(id)] as const),
  );
  return Object.fromEntries(loaded) as Record<string, LessonPatch>;
}

/** Is there a source to show for this id? Answered without fetching it. */
export function hasPatchSource(id: string): boolean {
  return id in sourceLoaders;
}

/**
 * The file that patch lives in - its text, and its lines highlighted.
 *
 * Fetched on the click that opens "View the code" (03c). A patch module
 * minifies and a patch's source text does not - the voice's file is six
 * kilobytes of text on its own - so sixty of them were the heaviest thing on
 * a lesson page, and the one a reader ever looks at is the one they asked for.
 */
export async function loadPatchSource(
  id: string,
): Promise<PatchSource | undefined> {
  const loader = sourceLoaders[id];
  if (!loader) return undefined;
  const source = await loader();
  return { text: source.default, lines: source.lines };
}
