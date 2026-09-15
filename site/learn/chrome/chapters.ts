/*
 * The section's table of contents, before the section exists.
 *
 * Eleven chapters, in the order research section 6 proposed and the content
 * tickets (08-14) name their folders. The map on `/learn` shows all of them
 * from the first day, because a tutorial that lists only what is written looks
 * like a tutorial that is three lessons long; the chapters that have no folder
 * yet are drawn and marked as not written.
 *
 * `content/learn/meta.json` carries the same eleven slugs, in the same order,
 * and that file is where a chapter's *place* is decided. This list is what the
 * map can say about a chapter before the folder is there: its number and its
 * name. Once the folder exists, the folder's own `meta.json` title wins - the
 * content is the truth and this is the plan.
 */

export interface PlannedChapter {
  /** The folder under `content/learn/`, and the second segment of every URL. */
  slug: string;
  /** What the map calls it until the folder exists and names itself. */
  title: string;
}

/**
 * The eleven, numbered by position: "Get started" is chapter 0, the way
 * Learning Synths numbers its first section and the way the research does.
 */
export const CHAPTERS: readonly PlannedChapter[] = [
  { slug: "get-started", title: "Get started" },
  { slug: "sound", title: "Sound" },
  { slug: "envelopes", title: "Envelopes" },
  { slug: "amplifiers", title: "Amplifiers" },
  { slug: "filters", title: "Filters" },
  { slug: "modulation", title: "Modulation" },
  { slug: "time", title: "Time as a signal" },
  { slug: "voices", title: "Notes and voices" },
  { slug: "recipes", title: "Recipes" },
  { slug: "effects", title: "Effects" },
  { slug: "beyond", title: "Beyond the book" },
];

/**
 * How long the core path is meant to be.
 *
 * Twenty: the *Learning Synths* equivalent, and the number chapters 0-5 carry
 * between them - six in 0 and 1, six in 2 and 3, four in 4, four in 5. The
 * path ends with chapter 5, because tickets 12-14 mark every lesson in
 * chapters 6-10 optional; there is nothing further to add to it.
 *
 * It is the progress bar's denominator, so it is also a claim about content,
 * and `core-path.test.ts` holds it to that claim: it counts the `core: true`
 * frontmatter on disk and fails when the two disagree. The folder README said
 * twenty-two for a while and the content tickets' tables said twenty; the test
 * is here so the next disagreement is caught by a run rather than by a reader
 * finishing the path and seeing a bar stop at 91%.
 */
export const CORE_PATH_SIZE = 20;

export function plannedChapter(slug: string): PlannedChapter | undefined {
  return CHAPTERS.find((chapter) => chapter.slug === slug);
}

/** A chapter's number, which is its place in the list. `undefined` if unplanned. */
export function plannedNumber(slug: string): number | undefined {
  const at = CHAPTERS.findIndex((chapter) => chapter.slug === slug);
  return at === -1 ? undefined : at;
}
