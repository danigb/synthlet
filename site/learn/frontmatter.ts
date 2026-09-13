import { z } from "zod";

/*
 * What a lesson declares about itself.
 *
 * Chapter and order are deliberately absent: they come from the folder the file
 * is in and from that folder's `meta.json`, so moving a lesson is moving a file
 * and reordering a chapter is reordering a list. Frontmatter carries only what
 * cannot be read off the tree.
 *
 * It lives here rather than inside `source.config.ts` because two things need
 * it: the build, through the fumadocs collection, and `rules.test.ts`, which
 * validates every file against the same object. A schema the test declares for
 * itself is a schema that drifts.
 */

/** Synth Secrets ran to sixty-three parts, May 1999 to July 2004. */
const BOOK_PARTS = 63;

export const lessonFrontmatter = z.object({
  title: z.string(),
  description: z.string().optional(),
  /** On the twenty-two-lesson core path - the *Learning Synths* equivalent. */
  core: z.boolean().optional(),
  /** The parts this lesson paraphrases, cited with `<Book />`. `[]` if none. */
  book: z.array(z.number().int().min(1).max(BOOK_PARTS)).optional(),
  /** One sentence: what the reader should be able to hear by the end. */
  hear: z.string().optional(),
  /** `ready`, or `blocked: <ticket>`. */
  status: z
    .string()
    .regex(
      /^(ready|blocked: \S.*)$/,
      'must be "ready" or "blocked: <what it waits for>"',
    )
    .optional(),
});

export type LessonFrontmatter = z.infer<typeof lessonFrontmatter>;

/**
 * The fields every *lesson* must carry.
 *
 * The schema above leaves them optional because `index.mdx` and `about.mdx` are
 * pages in the collection and not lessons: they have no sound to describe and
 * no place on the core path. `rules.test.ts` requires these four of anything
 * sitting inside a chapter folder, which is what a lesson is.
 */
export const LESSON_REQUIRED_FIELDS = [
  "core",
  "book",
  "hear",
  "status",
] as const;
